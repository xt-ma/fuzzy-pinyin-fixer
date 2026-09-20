# -*- coding: utf-8 -*-
"""Step 2: 合并 words_data 词库，pypinyin 校验读音归属，生成 data/words.json

数据模型（供前端使用）：
{
  "meta": {"version": 1, "generated": "...", "source": "..."},
  "pairs": {
    "in/ing": {
      "name": "in/ing", "label": "in / ing", "desc": "前后鼻音", "color": "#F97316",
      "entries": [
        {"char": "津", "reading": "jīn", "type": "in",
         "options": {"jīn": "in", "jīng": "ing"},
         "words": [{"word": "天津", "pinyin": "tiān jīn"}, ...]}
      ]
    },
    ...
  }
}
"""
import json, re, unicodedata, sys, os
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "words_data"))
from pypinyin import lazy_pinyin, Style, pinyin

import in_ing_1, in_ing_2, en_eng_1, l_n_1

# ---- 人工终审覆盖表：pypinyin 主读为旧读/误读时的权威修正 ----
# pypinyin 既是生成器又是校验器，无法发现自身源数据错误，故以此表为最终裁决。
# 新增条目必须附规范依据；配套审计脚本 scripts/audit_readings.py（Unihan 交叉校验）。
READING_OVERRIDES = {
    # 摒：《通用规范汉字表》《通用规范汉字字典》(kTGHZ2013)、Unihan kMandarin/kHanyuPinyin、
    # 台湾《国语一字多音审订表》均为 bìng；bǐng 是 1983 新华字典旧读（pypinyin 主读残留）。
    "摒": "bìng",
}

ALL = {}
for mod in (in_ing_1, in_ing_2, en_eng_1, l_n_1):
    for k, v in mod.WORDS.items():
        ALL.setdefault(k, []).extend(v)

def all_readings(char):
    """该字全部读音（含多音字非主要读音），如 参 -> [cān, cēn, shēn]"""
    sets = pinyin(char, style=Style.TONE, heteronym=True)[0]
    return list(dict.fromkeys(sets))

PAIR_DEF = {
    "in/ing": {"label": "in / ing", "desc": "前后鼻音", "color": "#F97316"},
    "en/eng": {"label": "en / eng", "desc": "前后鼻音", "color": "#8B5CF6"},
    "l/n":    {"label": "l / n",    "desc": "边音鼻音", "color": "#14B8A6"},
}

def strip_tone(py):
    decomposed = unicodedata.normalize("NFKD", py)
    return "".join(c for c in decomposed if not unicodedata.combining(c))

def pair_of_reading(py):
    """返回读音所属音对 set"""
    nt = strip_tone(py)
    g = set()
    if nt.endswith("in") or nt.endswith("ing"):
        g.add("in/ing")
    if nt.endswith("en") or nt.endswith("eng"):
        g.add("en/eng")
    if nt and nt[0] in "ln":
        g.add("l/n")
    return g

VOWEL_TONES = {
    "a": "āáǎà", "e": "ēéěè", "i": "īíǐì",
    "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ",
}

def apply_tone_digit(body, digit):
    """把 TONE3 数字声调叠加到拼音 body 的正确元音上（a > o/e > ui/iu 标后 > 其余）"""
    if not digit or digit not in "12345" or not body:
        return body
    idx = None
    if "a" in body:
        idx = body.index("a")
    elif "o" in body:
        idx = body.index("o")
    elif "e" in body:
        idx = body.index("e")
    else:
        if "ui" in body:
            idx = body.index("ui") + 1
        elif "iu" in body:
            idx = body.index("iu") + 1
        else:
            for i, ch in enumerate(body):
                if ch in "iuü":
                    idx = i
                    break
    if idx is None:
        return body
    tones = VOWEL_TONES.get(body[idx])
    if not tones:
        return body
    return body[:idx] + tones[int(digit) - 1] + body[idx + 1:]

def swap_pair_tone3(t3, pair):
    """基于 TONE3（如 jin1 / nv3）生成混淆读音：in<->ing, en<->eng, l<->n 互换"""
    digit = t3[-1] if t3[-1] in "12345" else ""
    nt = t3[:-1] if digit else t3
    def rebuild(body):
        body = body.replace("v", "ü")
        return apply_tone_digit(body, digit)
    if pair == "in/ing":
        if nt.endswith("ing"):
            return rebuild(nt[:-3] + "in")
        if nt.endswith("in"):
            return rebuild(nt[:-2] + "ing")
    elif pair == "en/eng":
        if nt.endswith("eng"):
            return rebuild(nt[:-3] + "en")
        if nt.endswith("en"):
            return rebuild(nt[:-2] + "eng")
    elif pair == "l/n":
        if nt and nt[0] == "l":
            return rebuild("n" + nt[1:])
        if nt and nt[0] == "n":
            return rebuild("l" + nt[1:])
    return t3

def word_reading(word, char):
    """返回目标字在词中的读音（取第一次出现位置），找不到返回 None。
    覆盖表优先：该字若经人工终审，一律采用终审读音。"""
    if char in READING_OVERRIDES:
        return READING_OVERRIDES[char]
    idx = word.find(char)
    if idx < 0:
        return None
    pys = lazy_pinyin(word, style=Style.TONE)
    if idx >= len(pys):
        return None
    return pys[idx]

def word_pinyin_str(word, char, reading):
    """词条拼音串：lazy_pinyin 生成后，把目标字首次出现位置的音节替换为
    终审读音（覆盖表字在 pypinyin 里的主读可能是旧读）。"""
    pys = list(lazy_pinyin(word, style=Style.TONE))
    idx = word.find(char)
    if idx >= 0 and idx < len(pys):
        pys[idx] = reading
    return " ".join(pys)

# ---- 按 (pair, char, reading) 聚合 ----
# 以词中目标字的实际读音为 reading 归类（精确匹配，避免多音字其他读音误配）
entries = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))  # pair -> char -> reading -> [words]
rejected = defaultdict(list)  # pair -> [(char, word, actual, expected)]

for char, words in ALL.items():
    for w in words:
        actual = word_reading(w, char)
        if actual is None:
            rejected["none"].append((char, w, "not-found", ""))
            continue
        for pair in pair_of_reading(actual):
            entries[pair][char].setdefault(actual, []).append(w)

# ---- 输出统计 ----
print("=== 校验结果 ===")
final = {"meta": {}, "pairs": {}}
for pair, defn in PAIR_DEF.items():
    e = entries[pair]
    n_entries = sum(len(rs) for rs in e.values())
    n_words = sum(len(wl) for rs in e.values() for wl in rs.values())
    missing = [c for c in e if len(e[c]) == 0]
    low = {c: rs for c, rs in e.items() if sum(len(wl) for wl in rs.values()) < 2}
    print(f"\n[{pair}] 字 {len(e)} / 条目 {n_entries} / 词条 {n_words}")
    print(f"  未定位读音词条 {len(rejected.get('none', []))} 条：", rejected.get("none", [])[:12])
    if missing: print("  无词条字:", "".join(missing))
    if low: print("  词条<2的字:", {k: sum(len(wl) for wl in v.values()) for k, v in low.items()})

# ---- 组装最终 JSON ----
final["meta"] = {
    "version": 2,
    "generated": "2026-08-16",
    "source": "现代汉语语料库词频表.xls（cncorpus 2000 万字语料）+ 人工词库备份（scripts/words_data/backup）",
    "note": "词库含 3 组音对：in/ing、en/eng、l/n；多音字按读音分属各组；每个词条读音经 pypinyin 校验；每字组词 2-5 个（词频表优先，不足补人工词库）。",
}

for pair, defn in PAIR_DEF.items():
    e = entries[pair]
    pair_entries = []
    for char in sorted(e.keys()):
        # 多音字全部读音 → TONE3 映射（去重且保持与读音顺序一致）
        tone3_map = {}
        for t, t3 in zip(
            pinyin(char, style=Style.TONE, heteronym=True)[0],
            pinyin(char, style=Style.TONE3, heteronym=True)[0],
        ):
            if t not in tone3_map:
                tone3_map[t] = t3
        for reading in sorted(e[char].keys()):
            words = list(dict.fromkeys(e[char][reading]))
            t3 = tone3_map.get(reading, reading)
            def tag_of(py):
                n2 = strip_tone(py)
                if n2.endswith("in"): return "in"
                if n2.endswith("ing"): return "ing"
                if n2.endswith("en"): return "en"
                if n2.endswith("eng"): return "eng"
                if n2 and n2[0] == "l": return "l"
                if n2 and n2[0] == "n": return "n"
                return ""
            correct_tag = tag_of(reading)
            wrong_py = swap_pair_tone3(t3, pair)
            wrong_tag = tag_of(wrong_py)
            pair_entries.append({
                "char": char,
                "reading": reading,
                "type": correct_tag,
                "options": {
                    "correct": {"py": reading, "tag": correct_tag},
                    "wrong": {"py": wrong_py, "tag": wrong_tag},
                },
                "words": [{"word": w, "pinyin": word_pinyin_str(w, char, reading)} for w in words],
            })
    final["pairs"][pair] = {
        "name": pair, "label": defn["label"], "desc": defn["desc"], "color": defn["color"],
        "entries": pair_entries,
    }

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out_json = os.path.join(ROOT, "data", "words.json")
out_js = os.path.join(ROOT, "data", "words.js")
os.makedirs(os.path.dirname(out_json), exist_ok=True)
with open(out_json, "w", encoding="utf-8") as f:
    json.dump(final, f, ensure_ascii=False, indent=1)
print(f"\n已写入 {out_json}，大小 {os.path.getsize(out_json)//1024} KB")

# 同步输出前端用的 words.js（紧凑格式，保持 window.WORDS_DATA = ... 结构）
with open(out_js, "w", encoding="utf-8") as f:
    f.write("// 模糊音克星 · 词库数据（由 scripts/build_words.py 自动生成，请勿手改）\n")
    f.write("window.WORDS_DATA = " + json.dumps(final, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(f"已写入 {out_js}，大小 {os.path.getsize(out_js)//1024} KB")
