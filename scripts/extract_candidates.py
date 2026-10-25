# -*- coding: utf-8 -*-
"""Step 1: 从 xlsx 提取前 3000 常用字，用 pypinyin 筛选三组音对候选字"""
import json
import openpyxl
from pypinyin import lazy_pinyin, Style

path = r"C:\dev\self\fuzzy-pinyin-fixer\Chinese character list from 2.5 billion words corpus ordered by frequency.xlsx"
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
ws = wb[wb.sheetnames[0]]

chars = []  # (rank, char)
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0:
        continue  # 表头
    rank, char = row[0], row[1]
    if not char or not isinstance(char, str):
        continue
    chars.append((rank, char))
    if len(chars) >= 3000:
        break

print("前3000常用字已提取:", len(chars))

def readings(char):
    """返回该字所有带声调读音（去重）"""
    return list(dict.fromkeys(lazy_pinyin(char, style=Style.TONE)))

def strip_tone(py):
    """去掉声调（NFKD 分解后移除组合声调符号），保留韵母信息"""
    import unicodedata
    decomposed = unicodedata.normalize('NFKD', py)
    return ''.join(c for c in decomposed if not unicodedata.combining(c))

def classify(py_list):
    """判断读音属于哪些音对：返回 set of 'in/ing','en/eng','l/n'"""
    groups = set()
    for py in py_list:
        no_tone = strip_tone(py)
        if no_tone.endswith('in') or no_tone.endswith('ing'):
            groups.add('in/ing')
        if no_tone.endswith('en') or no_tone.endswith('eng'):
            groups.add('en/eng')
        if no_tone and no_tone[0] in 'ln':
            groups.add('l/n')
    return groups

candidates = {'in/ing': [], 'en/eng': [], 'l/n': []}
all_detail = []
for rank, char in chars:
    pys = readings(char)
    groups = classify(pys)
    if groups:
        all_detail.append({'rank': rank, 'char': char, 'readings': pys, 'groups': sorted(groups)})
        for g in groups:
            candidates[g].append(char)

print("候选字统计（按字去重前计数，字可重叠）：")
for g, lst in candidates.items():
    print(f"  {g}: {len(lst)} 字")

# 去重后的总数
unique = set()
for d in all_detail:
    unique.add(d['char'])
print("去重后总候选字:", len(unique))

with open(r"C:\dev\self\fuzzy-pinyin-fixer\scripts\_candidates.json", "w", encoding="utf-8") as f:
    json.dump(all_detail, f, ensure_ascii=False, indent=1)
print("明细已写入 scripts/_candidates.json")
