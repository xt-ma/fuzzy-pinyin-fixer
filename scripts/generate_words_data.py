# -*- coding: utf-8 -*-
"""依据《现代汉语语料库词频表.xls》生成新的组词数据（scripts/words_data/*.py）

规则（每个关键字，即音对候选字）：
1. 词频表匹配词数在 2-5 → 全部纳入
2. 词频表匹配词数 > 5 → 取词频最高的前 5 个（词频表行序即词频降序）
3. 词频表匹配词数 < 2 → 追加备份人工词库（backup/）并去重；仍不足 2 个则保留
   追加后若超过 5 个，截断到前 5（词频词优先）

输出：scripts/words_data/{in_ing_1,in_ing_2,en_eng_1,l_n_1}.py（WORDS = {字: [词...]}）
供 build_words.py 继续走原管线（pypinyin 校验 → data/words.json / words.js）。
"""
import json, os, re, sys, unicodedata
from collections import defaultdict

import xlrd
from pypinyin import lazy_pinyin, Style

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLS = os.path.join(ROOT, "现代汉语语料库词频表.xls")
WORDS_JSON = os.path.join(ROOT, "data", "words.json")
BACKUP_DIR = os.path.join(ROOT, "scripts", "words_data", "backup")
OUT_DIR = os.path.join(ROOT, "scripts", "words_data")
MISSING_JSON = os.path.join(ROOT, "docs", "missing_keywords_analysis.json")

sys.path.insert(0, OUT_DIR)
from supplement_words import SUPPLEMENT
sys.path.pop(0)

PAIR_MODULES = ["in/ing", "en/eng", "l/n"]
# in/ing 字多，拆两个模块保持原 build_words.py 的 import 结构
MODULE_PLAN = {"in/ing": ["in_ing_1", "in_ing_2"], "en/eng": ["en_eng_1"], "l/n": ["l_n_1"]}
PAIR_LABEL = {"in/ing": "in / ing 前后鼻音", "en/eng": "en / eng 前后鼻音", "l/n": "l / n 边音鼻音"}


def strip_tone(py):
    decomposed = unicodedata.normalize("NFKD", py)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def pair_of_reading(py):
    nt = strip_tone(py)
    g = set()
    if nt.endswith("in") or nt.endswith("ing"):
        g.add("in/ing")
    if nt.endswith("en") or nt.endswith("eng"):
        g.add("en/eng")
    if nt and nt[0] in "ln":
        g.add("l/n")
    return g


def is_chinese_word(w):
    return bool(re.fullmatch(r"[\u4e00-\u9fff]+", w))


def load_freq_words():
    """词频表 → (pair, char) -> [words]（保持词频降序）"""
    wb = xlrd.open_workbook(XLS)
    sh = wb.sheet_by_index(0)
    freq = defaultdict(lambda: defaultdict(list))  # pair -> char -> [words]
    seen = set()
    for r in range(7, sh.nrows):
        w = str(sh.cell_value(r, 1)).strip()
        if not w or len(w) <= 1 or not is_chinese_word(w):
            continue
        if w in seen:
            continue
        seen.add(w)
        pys = lazy_pinyin(w, style=Style.TONE)
        if len(pys) != len(w):
            continue
        chars = list(w)
        for idx, c in enumerate(chars):
            apr = pair_of_reading(pys[idx])
            for pair in apr:
                # 同一词同一字重复出现（如「黑猩猩」两个「猩」）只记一次
                if w not in freq[pair][c]:
                    freq[pair][c].append(w)
    return freq


def load_backup():
    """backup 人工词库 → char -> [words]（去重）"""
    sys.path.insert(0, BACKUP_DIR)
    backup = defaultdict(list)
    for modname in ("in_ing_1", "in_ing_2", "en_eng_1", "l_n_1"):
        mod = __import__(modname)
        for k, v in mod.WORDS.items():
            for w in v:
                if w not in backup[k]:
                    backup[k].append(w)
    sys.path.pop(0)
    return backup


def load_candidates():
    """现有关键字集 + 词频表发现的缺失关键字：pair -> sorted(chars)"""
    with open(WORDS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    cand = defaultdict(set)
    for pair, p in data["pairs"].items():
        for e in p["entries"]:
            cand[pair].add(e["char"])
    # 附加缺失关键字（docs/missing_keywords_analysis.json 的分析结果）
    if os.path.exists(MISSING_JSON):
        mrep = json.load(open(MISSING_JSON, encoding="utf-8"))
        for rec in mrep.get("missing", []):
            for p in rec["pairs"]:
                cand[p].add(rec["char"])
    return {pair: sorted(cs) for pair, cs in cand.items()}


def dedup(seq):
    out = []
    for x in seq:
        if x not in out:
            out.append(x)
    return out


def main():
    freq = load_freq_words()
    backup = load_backup()
    cand = load_candidates()

    report = {}
    final = {}  # pair -> char -> [words]

    for pair in PAIR_MODULES:
        stats = {"rule_in_range": 0, "rule_top5": 0, "rule_backup": 0, "no_word": 0, "words": 0, "chars": 0}
        pair_words = {}
        for char in cand[pair]:
            fw = freq[pair].get(char, [])
            n = len(fw)
            if n < 2:
                # 词频词 + 备份人工词库 + 补充词表（新关键字 backup 无词，靠 supplement 补足）
                words = dedup(fw + backup.get(char, []) + SUPPLEMENT.get(char, []))
                if len(words) > 5:
                    words = words[:5]
                stats["rule_backup"] += 1
            elif n <= 5:
                words = fw
                stats["rule_in_range"] += 1
            else:
                words = fw[:5]
                stats["rule_top5"] += 1
            if not words:
                stats["no_word"] += 1
            pair_words[char] = words
            stats["words"] += len(words)
            stats["chars"] += 1
        final[pair] = pair_words
        report[pair] = stats

        wc = {c: len(ws) for c, ws in pair_words.items()}
        print(f"\n=== {pair} ===")
        print(f"  字数 {stats['chars']} / 词条总数 {stats['words']} / 每字 {min(wc.values())}-{max(wc.values())} 词")
        print(f"  规则分布: 2-5直接收 {stats['rule_in_range']} 字 | 取前5 {stats['rule_top5']} 字 | 补备份 {stats['rule_backup']} 字 | 无词 {stats['no_word']} 字")
        no = [c for c, ws in pair_words.items() if not ws]
        if no:
            print(f"  无词字: {''.join(no)}")

    # ---- 输出模块文件 ----
    os.makedirs(OUT_DIR, exist_ok=True)
    for pair, modnames in MODULE_PLAN.items():
        chars = sorted(final[pair].keys())
        chunks = [chars[i::len(modnames)] for i in range(len(modnames))]  # 轮转均分
        for modname, chunk in zip(modnames, chunks):
            lines = [
                "# -*- coding: utf-8 -*-",
                f"# {PAIR_LABEL[pair]} 组词库（{modname}）：字 -> 词频表词组（2-5 个，不足补人工词库）",
                "# 由 scripts/generate_words_data.py 依据《现代汉语语料库词频表.xls》自动生成，请勿手改",
                "",
                "WORDS = {",
            ]
            for c in chunk:
                words = final[pair][c]
                quoted = ", ".join(f'"{w}"' for w in words)
                lines.append(f'    "{c}": [{quoted}],')
            lines.append("}")
            path = os.path.join(OUT_DIR, modname + ".py")
            with open(path, "w", encoding="utf-8") as f:
                f.write("\n".join(lines))
            print(f"\n已写入 {path}（{len(chunk)} 字）")

    # ---- 汇总报告 ----
    total_chars = sum(report[p]["chars"] for p in report)
    total_words = sum(report[p]["words"] for p in report)
    print(f"\n总计: {total_chars} 字 / {total_words} 词条")


if __name__ == "__main__":
    main()
