# -*- coding: utf-8 -*-
"""验证：词频表中的模糊音字是否都被当前关键字库覆盖

对词频表每个多字词注音，收集所有"读音属于模糊音（in/ing、en/eng、l/n）"的字，
与 data/words.json 的关键字集对比，找出词频表有而关键字库没有的字（潜在缺口）。
"""
import json, os, re, unicodedata
from collections import defaultdict

import xlrd
from pypinyin import lazy_pinyin, Style

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLS = os.path.join(ROOT, "现代汉语语料库词频表.xls")
WORDS_JSON = os.path.join(ROOT, "data", "words.json")

PAIR_LABEL = {"in/ing": "in/ing", "en/eng": "en/eng", "l/n": "l/n"}


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


def tag_of(py):
    nt = strip_tone(py)
    if nt.endswith("in"): return "in"
    if nt.endswith("ing"): return "ing"
    if nt.endswith("en"): return "en"
    if nt.endswith("eng"): return "eng"
    if nt and nt[0] == "l": return "l"
    if nt and nt[0] == "n": return "n"
    return ""


def is_chinese_word(w):
    return bool(re.fullmatch(r"[\u4e00-\u9fff]+", w))


def main():
    # 1. 现有关键字集
    with open(WORDS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    key_chars = set()
    for pair, p in data["pairs"].items():
        for e in p["entries"]:
            key_chars.add(e["char"])
    print(f"现有关键字（去重）: {len(key_chars)}")

    # 2. 词频表扫描
    wb = xlrd.open_workbook(XLS)
    sh = wb.sheet_by_index(0)
    char_info = defaultdict(lambda: {"freq": 0, "readings": set(), "pairs": set(), "words": [], "tags": set()})
    seen_words = set()
    for r in range(7, sh.nrows):
        w = str(sh.cell_value(r, 1)).strip()
        if not w or len(w) <= 1 or not is_chinese_word(w):
            continue
        if w in seen_words:
            continue
        seen_words.add(w)
        freq = sh.cell_value(r, 2)
        freq = float(freq) if isinstance(freq, (int, float)) else 0.0
        pys = lazy_pinyin(w, style=Style.TONE)
        if len(pys) != len(w):
            continue
        for idx, c in enumerate(w):
            py = pys[idx]
            pr = pair_of_reading(py)
            if not pr:
                continue
            info = char_info[c]
            info["freq"] += freq
            info["readings"].add(py)
            info["pairs"].update(pr)
            info["tags"].add(tag_of(py))
            if len(info["words"]) < 3 and w not in info["words"]:
                info["words"].append(w)

    fuzzy_chars = set(char_info.keys())
    missing = {c: info for c, info in char_info.items() if c not in key_chars}

    print(f"词频表中模糊音字总数: {len(fuzzy_chars)}")
    print(f"其中不在关键字库: {len(missing)}（{len(missing)*100//len(fuzzy_chars)}%）")

    # 3. 按词频降序输出
    ordered = sorted(missing.items(), key=lambda kv: -kv[1]["freq"])
    report = []
    for c, info in ordered:
        rec = {
            "char": c,
            "freq": round(info["freq"], 1),
            "readings": sorted(info["readings"]),
            "pairs": sorted(info["pairs"]),
            "tags": sorted(info["tags"]),
            "example_words": info["words"],
        }
        report.append(rec)
        print(f"  {c}  {', '.join(sorted(info['readings']))}  [{', '.join(sorted(info['pairs']))}]  词频约{info['freq']:.0f}  例: {'/'.join(info['words'][:2])}")

    # 按音对统计缺失字
    by_pair = defaultdict(list)
    for rec in report:
        for p in rec["pairs"]:
            by_pair[p].append(rec["char"])
    print("\n缺失字按音对分布:")
    for p in PAIR_LABEL:
        chars = by_pair.get(p, [])
        print(f"  {p}: {len(chars)} 字  {''.join(chars[:60])}")

    out = os.path.join(ROOT, "docs", "missing_keywords_analysis.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"total_fuzzy_chars": len(fuzzy_chars), "missing": report}, f, ensure_ascii=False, indent=1)
    print(f"\n详细数据已写入 {out}")


if __name__ == "__main__":
    main()
