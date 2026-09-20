# -*- coding: utf-8 -*-
"""读音权威性审计：data/words.json 全部条目 vs Unicode Unihan 官方读音数据交叉校验。

背景（2026-09-20 审计）：词库由 build_words.py 经 pypinyin 生成校验，而 pypinyin
自身源数据可能残留旧读（如「摒」主读 bǐng，1983 新华字典旧读），自校验存在盲区。
本脚本用独立权威源（Unihan kMandarin / kHanyuPinyin / kXHC1983）终审。

判定规则：
  FAIL  无调号且非合法轻声
  FAIL  读音不被任何 Unihan 字段支撑（也不在 READING_OVERRIDES 白名单语义内）
  INFO  与 kMandarin 主读不同但有任一 Unihan 字段支撑（多音字又读，预期内）

用法：python scripts/audit_readings.py
  首次运行自动下载 Unihan.zip（约 8MB）到 scripts/_unihan_cache/（已 gitignore）。
退出码：有 FAIL 时非零（可接入 CI/钩子，默认不进 npm test——避免测试依赖网络）。
"""
import io, json, os, re, sys, unicodedata, urllib.request, zipfile

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(ROOT, "scripts", "_unihan_cache")
UNIHAN_URL = "https://www.unicode.org/Public/16.0.0/ucd/Unihan.zip"

# 合法轻声（无调号）闭集：助词/叹词类
NEUTRAL_OK = {
    "le", "ne", "lo", "la", "li", "de", "me", "zhe", "zhei", "shei", "ge", "men",
    "ba", "ma", "a", "ai", "ei", "ng", "n", "m", "en", "hm", "hng", "teng", "lao",
}


def load_unihan():
    os.makedirs(CACHE_DIR, exist_ok=True)
    zip_path = os.path.join(CACHE_DIR, "Unihan.zip")
    if not os.path.exists(zip_path):
        print(f"下载 Unihan.zip → {zip_path}（约 8MB，仅首次）…")
        urllib.request.urlretrieve(UNIHAN_URL, zip_path)
    k_mandarin, k_hanyu, k_xhc = {}, {}, {}
    with zipfile.ZipFile(zip_path) as z:
        for line in z.read("Unihan_Readings.txt").decode("utf-8").splitlines():
            if line.startswith("#") or not line.strip():
                continue
            parts = [p.strip() for p in line.split("\t")]
            if len(parts) < 3:
                continue
            cp, field, value = int(parts[0][2:], 16), parts[1], parts[2]
            if field == "kMandarin":
                k_mandarin[cp] = value.split()[0]
            elif field == "kHanyuPinyin":
                for chunk in value.split():
                    if ":" in chunk:
                        k_hanyu.setdefault(cp, set()).update(chunk.split(":", 1)[1].split())
            elif field == "kXHC1983":
                for chunk in value.split():
                    body = chunk.split(":", 1)[1] if ":" in chunk else chunk
                    k_xhc.setdefault(cp, set()).update(
                        re.findall(r"[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+[0-5]?", body)
                    )
    return k_mandarin, k_hanyu, k_xhc


COMB = {"\u0304": 1, "\u0301": 2, "\u030C": 3, "\u0300": 4}


def strip_tone(py):
    s = unicodedata.normalize("NFKD", py)
    return "".join(c for c in s if not (0x0300 <= ord(c) <= 0x036F)).replace("ü", "u")


def tone_digit(py):
    for c in unicodedata.normalize("NFKD", py):
        if c in COMB:
            return COMB[c]
    return 0


def norm(syl):
    """任意格式（bǐng / bing3 / bing）→ (无调音节, 声调数字)"""
    syl = syl.strip()
    m = re.match(r"^([a-z]+?)([1-5])$", syl)
    if m:
        return (m.group(1), int(m.group(2)))
    return (strip_tone(syl), tone_digit(syl))


def main():
    k_mandarin, k_hanyu, k_xhc = load_unihan()
    data = json.load(io.open(os.path.join(ROOT, "data", "words.json"), encoding="utf-8"))
    fails, infos = [], []
    total = 0
    for pair, pdata in data["pairs"].items():
        for e in pdata["entries"]:
            total += 1
            ch, reading = e["char"], e["reading"]
            cp = ord(ch)
            stored = norm(reading)
            if stored[1] == 0:
                # 轻声不参与 Unihan 比对（Unihan 只收录带调读音）：
                # 白名单内的轻声放行，白名单外的判 FAIL
                if stored[0] not in NEUTRAL_OK:
                    fails.append(f"[{pair}] {ch} {reading} 无调号且非合法轻声")
                continue
            pri = k_mandarin.get(cp)
            readings = set()
            readings.update(norm(s) for s in k_hanyu.get(cp, set()))
            readings.update(norm(s) for s in k_xhc.get(cp, set()))
            readings.update(norm(pri) for pri in ([pri] if pri else []))
            if stored not in readings:
                fails.append(f"[{pair}] {ch} 标注={reading} 不被任何 Unihan 字段支撑"
                             f"（主读={pri}，GB/kXHC={sorted(readings)}）")
            elif pri and stored != norm(pri):
                infos.append(f"[{pair}] {ch} {reading}（主读={pri}，属合法又读）")
    print(f"审计 {total} 条目：FAIL {len(fails)} / INFO {len(infos)}")
    for f in fails:
        print("  ✗ " + f)
    if "--verbose" in sys.argv:
        for i in infos:
            print("  ℹ " + i)
    else:
        print(f"  （INFO {len(infos)} 条多音字又读，--verbose 查看）")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
