# -*- coding: utf-8 -*-
"""分析《现代汉语语料库词频表.xls》：为每个模糊音关键字匹配词组

目的：评估用词频表自动组词的效果（替代/补充人工精选词库）
- 剔除单字词
- 对每个词注音，筛出含模糊音（in/ing、en/eng、l/n）的词
- 按"字"统计：每个关键字（音对候选字）匹配到多少词
- 输出：各音对词条数、覆盖率、min/max、分布数据
"""
import json, re, unicodedata, os, sys
from collections import Counter, defaultdict

import xlrd
from pypinyin import lazy_pinyin, Style

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLS = os.path.join(ROOT, "现代汉语语料库词频表.xls")
WORDS_JSON = os.path.join(ROOT, "data", "words.json")

PAIR_LABEL = {"in/ing": "in / ing 前后鼻音", "en/eng": "en / eng 前后鼻音", "l/n": "l / n 边音鼻音"}


def strip_tone(py):
    decomposed = unicodedata.normalize("NFKD", py)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def pair_of_reading(py):
    """读音所属音对 set"""
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


def main():
    # ---- 1. 读词频表 ----
    wb = xlrd.open_workbook(XLS)
    sh = wb.sheet_by_index(0)
    words = []  # [(word, freq)]
    for r in range(7, sh.nrows):
        w = str(sh.cell_value(r, 1)).strip()
        if not w or not is_chinese_word(w):
            continue
        freq = sh.cell_value(r, 2)
        words.append((w, float(freq) if isinstance(freq, (int, float)) else 0.0))
    print(f"词频表总词数: {len(words)}")

    # ---- 2. 剔除单字 ----
    multi = [(w, f) for w, f in words if len(w) > 1]
    print(f"剔除单字后: {len(multi)}（单字 {len(words) - len(multi)} 个）")

    # ---- 3. 读现有关键字集（words.json）----
    with open(WORDS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    # pair -> char -> {reading, ...}   （一个字的多个读音合并）
    cand = defaultdict(dict)  # pair -> char -> set(readings)
    for pair, p in data["pairs"].items():
        for e in p["entries"]:
            cand[pair].setdefault(e["char"], set()).add(e["reading"])
    for pair, chars in cand.items():
        print(f"候选字 {pair}: {len(chars)} 个")

    # ---- 4. 给多字词批量注音并匹配 ----
    pair_char_words = defaultdict(lambda: defaultdict(set))  # pair -> char -> set(word)
    pair_words = defaultdict(set)  # pair -> set(word)
    stats_by_char = defaultdict(dict)  # pair -> char -> {words, freq_sum}

    # 逐词注音（lazy_pinyin 不支持 list 批量传参，会错位）
    multi_words = [w for w, _ in multi]
    pinyin_map = {}
    for w in multi_words:
        pinyin_map[w] = lazy_pinyin(w, style=Style.TONE)

    no_pinyin = 0
    for w in multi_words:
        pys = pinyin_map.get(w)
        if not pys or len(pys) != len(w):
            no_pinyin += 1
            continue
        chars = list(w)
        for idx, c in enumerate(chars):
            actual = pys[idx]
            apr = pair_of_reading(actual)
            for pair in apr:
                if c in cand[pair]:
                    pair_char_words[pair][c].add(w)
                    pair_words[pair].add(w)
                    rec = stats_by_char[pair].setdefault(c, {"words": set(), "freq": 0.0})
                    rec["words"].add(w)
    print(f"注音失败/长度不匹配词: {no_pinyin}")

    # ---- 5. 汇总输出 ----
    report = {"meta": {"source": "现代汉语语料库词频表.xls", "total_words": len(multi)}, "pairs": {}}
    for pair in cand:
        chars = cand[pair]
        matched = pair_char_words[pair]
        n_chars = len(chars)
        n_matched = len(matched)
        n_words_total = len(pair_words[pair])
        no_word_chars = sorted(ch for ch in chars if ch not in matched)

        # 每字词数
        counts = {c: len(matched.get(c, set())) for c in chars}
        if counts:
            mx = max(counts.values())
            mn = min(counts.values())
            avg = sum(counts.values()) / len(counts)
        else:
            mx = mn = avg = 0

        # 分布：n -> 字数
        dist = Counter(counts.values())

        report["pairs"][pair] = {
            "label": PAIR_LABEL[pair],
            "candidate_chars": n_chars,
            "matched_chars": n_matched,
            "word_count": n_words_total,
            "no_word_chars": no_word_chars,
            "min_words": mn,
            "max_words": mx,
            "avg_words": round(avg, 2),
            "distribution": {str(n): dist[n] for n in sorted(dist)},
            "max_char": max((c for c in chars if counts[c] == mx), key=lambda c: counts[c]),
        }

        print(f"\n=== {pair} ===")
        print(f"  候选字 {n_chars}，覆盖 {n_matched}（{n_matched * 100 // n_chars}%），词组 {n_words_total}")
        print(f"  每字词数: min={mn} max={mx} avg={avg:.1f}  最多的字: {report['pairs'][pair]['max_char']}({mx})")
        if no_word_chars:
            print(f"  无词字({len(no_word_chars)}): {''.join(no_word_chars)}")
        dist_str = "  ".join(f"{n}词×{cnt}字" for n, cnt in sorted(dist.items())[:20])
        print(f"  分布(前20): {dist_str}")

    out = os.path.join(ROOT, "docs", "wordfreq_analysis.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print(f"\n详细数据已写入 {out}")

    # 额外：全部匹配词清单（供下一步生成用）
    out2 = os.path.join(ROOT, "docs", "wordfreq_matched_words.json")
    matched_all = {
        pair: {c: sorted(ws) for c, ws in pair_char_words[pair].items()}
        for pair in cand
    }
    with open(out2, "w", encoding="utf-8") as f:
        json.dump(matched_all, f, ensure_ascii=False, indent=1)
    print(f"匹配词清单已写入 {out2}")


if __name__ == "__main__":
    main()
