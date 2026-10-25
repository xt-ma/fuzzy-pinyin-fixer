# -*- coding: utf-8 -*-
"""声旁（谐声）系列统计：data/words.json 练习字 → 声旁识别 / 系列归纳 / 反例筛查。

方法概述：
  1. 用 cjkvi-ids（CHISE IDS 维护版）递归拆字，得到每个字的全部部件；
  2. 部件读音取 Unicode Unihan kMandarin；整字读音取词库条目；
  3. 整字 vs 部件读音分五档：声韵调全同 / 声韵同 / 仅韵母同(ü≈u) / 仅声母同 / 无关；
     部件须为 CJK 统一表意文字且非基本笔画（排除 丿一乙 等伪声旁）；
  4. 取最高档部件为「声旁」。连边规则：cat>=2，或 cat==1 且韵母恰好是本项目
     的混淆音对（in↔ing、en↔eng）——后者正是「声旁韵母不可类推」的反例，
     单独标记 trap_fuzzy；
  5. 并查集聚成「谐声系列」；系列内前后鼻音不一致 / l-n 声母不一致 → 冲突系列。

输出：
  docs/phonetic-series.json          机器可读全量数据（供后续划词查询等功能开发）
  stdout                             摘要（报告另由 analyze 产出）
  加 --report 参数时同步写 docs/phonetic-series-analysis.md

用法：python scripts/analyze_phonetic_series.py [--report]

局限（解读数据时须知）：
  - 声旁判定按「读音相似」反推，声旁在现代读音中完全变读的字（如 银←艮 yín←gèn）
    会落在「无可识别声旁」桶里，不代表它不是形声字，只代表读音类推对它无效。
"""
import json
import os
import sys
import urllib.request
import zipfile
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(ROOT, "scripts", "_unihan_cache")
IDS_URL = "https://raw.githubusercontent.com/cjkvi/cjkvi-ids/master/ids.txt"
UNIHAN_URL = "https://www.unicode.org/Public/16.0.0/ucd/Unihan.zip"

IDS_STRUCT = {chr(c) for c in range(0x2FF0, 0x2FFC)}  # ⿰⿱…⿻ 结构符

# 基本笔画有 kMandarin 读音（丿 piě、乚 yǐn…），绝不能当声旁
STROKE_DENY = set("一丨丿丶乙乚乛亅乀乁丷丆乄丂丄丅乁乚𠃊𠃋𠃌𠃍𠃎𠃑𡿨")

# 本项目的混淆音对：韵母仅在前后鼻音上不同时，cat1（仅声母同）也值得连边标记
FUZZY_FINAL_PAIRS = ({"in", "ing"}, {"en", "eng"})

# ---------- 拼音解析 ----------

_TONE_GROUPS = (
    ("āáǎà", "a"), ("ēéěè", "e"), ("īíǐì", "i"), ("ōóǒò", "o"),
    ("ūúǔù", "u"), ("ǖǘǚǜ", "ü"), ("ńňǹ", "n"), ("ḿ", "m"),
)
TONE_OF = {}   # 带调字符 → 声调号
BASE_OF = {}   # 带调字符 → 不带调基元
for _toned, _base in _TONE_GROUPS:
    for _i, _ch in enumerate(_toned):
        TONE_OF[_ch] = _i + 1
        BASE_OF[_ch] = _base

_INITIALS_TWO = ("zh", "ch", "sh")
_INITIALS_ONE = set("bpmfdtnlgkhjqxrzcsyw")


def parse_py(py):
    """带调拼音 → (声母, 韵母, 声调)。ü 归一为 u 便于比较；无声调记 0。"""
    tone, out = 0, []
    for ch in py:
        if ch in TONE_OF:
            tone = TONE_OF[ch]
            out.append(BASE_OF[ch])
        else:
            out.append(ch)
    base = "".join(out)
    initial = ""
    for ini in _INITIALS_TWO:
        if base.startswith(ini):
            initial = ini
            break
    else:
        if base and base[0] in _INITIALS_ONE:
            initial = base[0]
    final = base[len(initial):].replace("ü", "u")
    return initial, final, tone


def match_cat(a, b):
    """两读音的五档：4 声韵调全同 / 3 声韵同 / 2 仅韵母同 / 1 仅声母同 / 0 无关。"""
    same_i, same_f = a[0] == b[0], a[1] == b[1]
    if same_i and same_f:
        return 4 if a[2] == b[2] else 3
    if same_f:
        return 2
    if same_i:
        return 1
    return 0


def fuzzy_final(fa, fb):
    """两韵母是否只差一个前后鼻音（in/ing、en/eng）。"""
    return any(fa in g and fb in g for g in FUZZY_FINAL_PAIRS)


# ---------- 数据加载 ----------

def _ensure(url, name):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, name)
    if not os.path.exists(path):
        print(f"下载 {name} → {path}（仅首次）…")
        urllib.request.urlretrieve(url, path)
    return path


def load_mandarin():
    path = _ensure(UNIHAN_URL, "Unihan.zip")
    m = defaultdict(list)
    r = {}
    with zipfile.ZipFile(path) as z:
        for line in z.read("Unihan_Readings.txt").decode("utf-8").splitlines():
            if not line.startswith("U+") or "\tkMandarin\t" not in line:
                continue
            cp, _field, value = line.split("\t", 2)
            m[chr(int(cp[2:], 16))].extend(value.split())
        # kRSUnicode（Unicode 16 起在 Unihan_IRGSources.txt）：char → 主部首号，
        # 用于排除「部首部件」冒充声旁（如 仍⿰亻乃 的 亻 读 rén、性⿰忄生 的 忄 读 xīn）
        for line in z.read("Unihan_IRGSources.txt").decode("utf-8").splitlines():
            if not line.startswith("U+") or "\tkRSUnicode\t" not in line:
                continue
            cp, _field, value = line.split("\t", 2)
            first = value.split()[0].split(".")[0]
            r[chr(int(cp[2:], 16))] = int(first) if first.isdigit() else -1
    return m, r


def load_ids():
    path = _ensure(IDS_URL, "cjkvi-ids.txt")
    m = defaultdict(list)
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 3 and parts[2].strip():
                m[parts[1]].append(parts[2])
    return m


IDS = load_ids()
MANDARIN, KRS = load_mandarin()


def _tokens(ids_str):
    toks, i = [], 0
    while i < len(ids_str):
        if ids_str[i] == "&":  # &CDP-xxxx; 部件引用
            j = ids_str.find(";", i)
            j = j if j != -1 else len(ids_str) - 1
            toks.append(ids_str[i : j + 1])
            i = j + 1
        else:
            toks.append(ids_str[i])
            i += 1
    return toks


def _is_ideograph(ch):
    cp = ord(ch)
    return 0x3400 <= cp <= 0x9FFF or 0x20000 <= cp <= 0x3FFFF


def components(ch, depth=0, seen=None):
    """递归收集 ch 的全部单字部件（不含结构符、CDP 引用与非表意文字）。"""
    if seen is None:
        seen = set()
    if ch in seen or depth > 4:
        return set()
    seen.add(ch)
    out = set()
    for ids in IDS.get(ch, []):
        for tok in _tokens(ids):
            if tok in IDS_STRUCT or tok.startswith("&") or not _is_ideograph(tok):
                continue
            out.add(tok)
            out |= components(tok, depth + 1, seen)
    return out


# ---------- 声旁识别 ----------

def readable_phonetic_candidates(char):
    """可作为声旁候选的部件：非笔画、有读音、且不是该字的部首。"""
    krad = KRS.get(char, -1)
    out = []
    for k in sorted(components(char) - {char}):
        if k in STROKE_DENY or not MANDARIN.get(k):
            continue
        if KRS.get(k, -1) == krad and krad != -1:
            continue  # 部首部件（如 仍之亻、性之忄）不是声旁
        out.append(k)
    return out


def best_parent(char, readings):
    """整字读音 vs 全部声旁候选读音，取最高档者为声旁。返回 (cat, 声旁, 整字读, 声旁读)。"""
    best = (0, None, None, None)
    for k in readable_phonetic_candidates(char):
        for cr in readings:
            pcr = parse_py(cr)
            for kr in MANDARIN[k]:
                cat = match_cat(pcr, parse_py(kr))
                if cat > best[0]:
                    best = (cat, k, cr, kr)
    return best


def linkable(cat, char_reading, parent_reading):
    """是否连边进系列：cat>=2 一律连；cat==1 且韵母恰为混淆音对（反例）也连。"""
    if cat >= 2:
        return True
    if cat == 1:
        fa, fb = parse_py(char_reading)[1], parse_py(parent_reading)[1]
        return fuzzy_final(fa, fb)
    return False


# ---------- 主流程 ----------

def main():
    with open(os.path.join(ROOT, "data", "words.json"), encoding="utf-8") as f:
        data = json.load(f)

    # 练习条目 → 字级聚合
    char_entries = defaultdict(list)  # char -> [{reading,pair,type}]
    for pair_name, pair in data["pairs"].items():
        for e in pair["entries"]:
            char_entries[e["char"]].append(
                {"reading": e["reading"], "pair": pair_name, "type": e["type"]}
            )

    info = {}
    for ch, entries in char_entries.items():
        readings = sorted({e["reading"] for e in entries})
        cat, parent, cr, kr = best_parent(ch, readings)
        info[ch] = {
            "entries": entries,
            "readings": readings,
            "parent": {"cat": cat, "char": parent,
                       "char_reading": cr, "parent_reading": kr},
        }

    # 并查集聚成谐声系列
    uf = {}

    def find(x):
        uf.setdefault(x, x)
        while uf[x] != x:
            uf[x] = uf[uf[x]]
            x = uf[x]
        return x

    def union(child, parent):
        # 方向指向声旁：让系列根落在声旁核心（丁/青/艮）而非首见字
        rc, rp = find(child), find(parent)
        if rc != rp:
            uf[rc] = rp

    for ch, d in info.items():
        p = d["parent"]
        if p["char"] and linkable(p["cat"], p["char_reading"], p["parent_reading"]):
            union(ch, p["char"])

    series = defaultdict(list)
    for ch in info:
        series[find(ch)].append(ch)

    # 前后鼻音 / l-n 冲突判定（以练习条目的 type 为准）
    FRONT = {"in", "en"}
    BACK = {"ing", "eng"}

    def nose_tags(ch):
        return {("前" if e["type"] in FRONT else "后")
                for e in info[ch]["entries"] if e["type"] in FRONT | BACK}

    def ln_tags(ch):
        return {e["type"] for e in info[ch]["entries"] if e["type"] in ("l", "n")}

    rows = []
    comp_cache = {ch: components(ch) for ch in info}
    for root, members in series.items():
        prac = sorted(m for m in members if m in info)
        if len(prac) < 2:
            continue
        # 展示根：优先取并查集根（常为被全体成员共享的非练习声旁，如 艮/巠），
        # 其无读音时退回「被最多成员包含的成员」
        core = max(prac, key=lambda m: (sum(m in comp_cache[o] for o in prac if o != m), -ord(m)))
        disp = root if MANDARIN.get(root) else core
        nose = set().union(*[nose_tags(m) for m in prac])
        ini = set().union(*[ln_tags(m) for m in prac])
        rows.append({
            "root": disp,
            "root_readings": sorted(MANDARIN.get(disp, ["?"])),
            "members": prac,
            "nose_conflict": len(nose) > 1,   # 系列内前后鼻音不一致
            "ln_conflict": len(ini) > 1,      # 系列内 l/n 声母不一致
        })
    rows.sort(key=lambda r: (-len(r["members"]), r["root"]))

    # ---------- 统计 ----------
    n = len(info)
    cats = defaultdict(int)
    for d in info.values():
        cats[d["parent"]["cat"]] += 1
    multi = sum(len(r["members"]) for r in rows)

    # 反例分类
    trap_fuzzy = []   # 声母同、韵母恰差前后鼻音（声旁韵母不可类推，如 宾←兵）
    trap_initial = []  # 韵母同、声母 l/n 交叉（声旁声母不可类推）
    for ch, d in sorted(info.items()):
        p = d["parent"]
        if p["cat"] == 0 or not p["char"]:
            continue
        pc, pk = parse_py(p["char_reading"]), parse_py(p["parent_reading"])
        if p["cat"] == 1 and fuzzy_final(pc[1], pk[1]):
            trap_fuzzy.append((ch, p["char_reading"], p["char"], p["parent_reading"]))
        elif p["cat"] == 2 and {pc[0], pk[0]} == {"l", "n"}:
            trap_initial.append((ch, p["char_reading"], p["char"], p["parent_reading"]))

    # 声旁完全变读：读音与部件全然无关但有形似声旁候选（如 星←生 shēng、银←艮 gèn）
    diverged = []
    for ch, d in sorted(info.items()):
        if d["parent"]["cat"] > 0:
            continue
        cands = [(k, MANDARIN[k][0]) for k in readable_phonetic_candidates(ch)[:3]]
        if cands:
            diverged.append((ch, d["readings"][0], cands))

    print(f"练习字总数（去重）: {n}")
    print(f"声旁五档分布: 全同={cats[4]} 声韵同={cats[3]} 仅韵母同={cats[2]} "
          f"仅声母同={cats[1]} 无={cats[0]}")
    print(f"≥2 练习字的谐声系列: {len(rows)} 个，覆盖 {multi} 字（{multi / n:.0%}）")
    print(f"前后鼻音冲突系列: {sum(r['nose_conflict'] for r in rows)} 个；"
          f"l/n 冲突系列: {sum(r['ln_conflict'] for r in rows)} 个")
    print(f"反例-韵母不可类推（声母同而韵母差前后鼻音）: {len(trap_fuzzy)} 字：")
    for ch, cr, k, kr in trap_fuzzy:
        print(f"  {ch} {cr} ← 声旁 {k} {kr}")
    print(f"反例-声母不可类推（韵母同而 l/n 交叉）: {len(trap_initial)} 字：")
    for ch, cr, k, kr in trap_initial:
        print(f"  {ch} {cr} ← 声旁 {k} {kr}")
    print(f"声旁完全变读（形似声旁但读音无关，含会意/象形）: {len(diverged)} 字（前 15 示例）：")
    for ch, cr, cands in diverged[:15]:
        cs = "、".join(f"{k}({kr})" for k, kr in cands)
        print(f"  {ch} {cr} ← 形似部件 {cs}")

    # ---------- 产出 ----------
    out = {
        "meta": {
            "version": 2,
            "generated": "2026-09-20",
            "method": "cjkvi-ids 拆字 + Unihan kMandarin 读音，五档匹配取最优部件为声旁；"
                      "cat>=2 或（cat==1 且 in/ing、en/eng 混淆韵母）连边聚类",
            "sources": [IDS_URL, UNIHAN_URL],
            "stats": {
                "total_chars": n,
                "cat_dist": {str(k): v for k, v in sorted(cats.items())},
                "series_ge2": len(rows),
                "chars_in_series": multi,
                "nose_conflict_series": sum(r["nose_conflict"] for r in rows),
                "ln_conflict_series": sum(r["ln_conflict"] for r in rows),
                "trap_fuzzy": [list(t) for t in trap_fuzzy],
                "trap_initial": [list(t) for t in trap_initial],
                "diverged": [[ch, cr, cands] for ch, cr, cands in diverged],
            },
        },
        "chars": info,
        "series": rows,
    }
    with open(os.path.join(ROOT, "docs", "phonetic-series.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("已写出 docs/phonetic-series.json")

    if "--report" in sys.argv:
        write_report(info, rows, cats, trap_fuzzy, trap_initial, diverged, n)


CAT_MARK = {4: "●", 3: "◑", 2: "○", 1: "◔", 0: "·"}


def _entry_tags(info_ch):
    return "/".join(f"{e['reading']}" for e in info_ch["entries"])


def write_report(info, rows, cats, trap_fuzzy, trap_initial, diverged, n):
    p = os.path.join(ROOT, "docs", "phonetic-series-analysis.md")
    L = []
    L.append("<!-- 由 scripts/analyze_phonetic_series.py --report 生成；手工段落见各节叙述 -->\n")
    L.append("## 统计总览\n")
    L.append(f"- 练习字（去重）：{n}")
    L.append(f"- 声旁识别五档：声韵调全同 {cats[4]}（{cats[4]/n:.0%}）｜声韵同 {cats[3]}"
             f"（{cats[3]/n:.0%}）｜仅韵母同 {cats[2]}（{cats[2]/n:.0%}）｜"
             f"仅声母同 {cats[1]}（{cats[1]/n:.0%}）｜无可识别声旁 {cats[0]}（{cats[0]/n:.0%}）")
    multi = sum(len(r["members"]) for r in rows)
    L.append(f"- ≥2 字的谐声系列：{len(rows)} 个，覆盖 {multi} 字（{multi/n:.0%}）；"
             f"其余 {n - multi} 字为单字（含象形/会意/声旁完全变读）")
    L.append(f"- 前后鼻音冲突系列：{sum(r['nose_conflict'] for r in rows)} 个；"
             f"l/n 声母冲突系列：{sum(r['ln_conflict'] for r in rows)} 个\n")

    L.append("## 冲突系列（最高教学价值：同声旁但跨越混淆边界）\n")
    for r in rows:
        if not (r["nose_conflict"] or r["ln_conflict"]):
            continue
        L.append(f"**{r['root']}（{'/'.join(r['root_readings'])}）族**：")
        L.append("- " + "、".join(
            f"{m}（{_entry_tags(info[m])}）" for m in r["members"]))
        L.append("")
    L.append("## 反例字清单（声旁读音不可类推）\n")
    L.append("**韵母不可类推**（声母同、韵母恰差前后鼻音）：")
    L.append("- " + "、".join(f"{ch} {cr}（声旁 {k} {kr}）" for ch, cr, k, kr in trap_fuzzy))
    L.append("\n**声母不可类推**（韵母同、l/n 交叉）：")
    L.append("- " + "、".join(f"{ch} {cr}（声旁 {k} {kr}）" for ch, cr, k, kr in trap_initial))
    practice = set(info)
    hot_diverged = [(ch, cr, cands) for ch, cr, cands in diverged
                    if any(k in practice for k, _ in cands)]
    L.append(f"\n**声旁完全变读**（形似声旁、读音无关；仅列候选含练习字的 "
             f"{len(hot_diverged)}/{len(diverged)} 字，全表见 phonetic-series.json）：")
    L.append("- " + "、".join(
        f"{ch} {cr}（形似 {'/'.join(f'{k} {kr}' for k, kr in cands if k in practice)}）"
        for ch, cr, cands in hot_diverged))
    L.append("")

    L.append("## 谐声系列总表（按规模降序）\n")
    L.append("标记：● 声韵调全同｜◑ 声韵同｜○ 仅韵母同｜◔ 仅声母同｜· 无\n")
    L.append("| 声旁 | 读音 | 系列成员（读音+声旁关系档位） | 冲突 |")
    L.append("| --- | --- | --- | --- |")
    for r in rows:
        mem = "、".join(
            f"{m} {_entry_tags(info[m])} {CAT_MARK[info[m]['parent']['cat']]}"
            for m in r["members"])
        flag = ("前后鼻音 " if r["nose_conflict"] else "") + ("l/n" if r["ln_conflict"] else "")
        L.append(f"| {r['root']} | {'/'.join(r['root_readings'])} | {mem} | {flag or '—'} |")
    L.append("")
    with open(p, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    print(f"已写出 {p}")


if __name__ == "__main__":
    main()
