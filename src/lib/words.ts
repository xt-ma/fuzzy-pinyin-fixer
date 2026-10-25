/* ============================================================
   模糊音克星 · 词库数据访问层
   数据源 data/words.json（由 scripts/build_words.py 生成，构建产物）
   ============================================================ */
import wordsJson from "../../data/words.json" with { type: "json" };

export interface WordItem {
  word: string;
  pinyin: string;
}

export interface PyTag {
  py: string;
  tag: string;
}

export interface Entry {
  char: string;
  reading: string;
  type: string;
  options: { correct: PyTag; wrong: PyTag };
  words: WordItem[];
}

export interface PairGroup {
  name: string;
  label: string;
  desc: string;
  color: string;
  entries: Entry[];
}

export interface WordsData {
  meta: Record<string, unknown>;
  pairs: Record<string, PairGroup>;
}

export const DATA = wordsJson as unknown as WordsData;

export const PAIR_ORDER: string[] = ["in/ing", "en/eng", "l/n"];

/** 词库查找表：char -> [{reading, pair, entry}]，用于识别词语中的其他可考字（多音字按词内实际读音匹配） */
export const CHAR_LOOKUP: Record<string, { reading: string; pair: string; entry: Entry }[]> = (() => {
  const m: Record<string, { reading: string; pair: string; entry: Entry }[]> = {};
  PAIR_ORDER.forEach((p) => {
    const entries = (DATA.pairs[p] || {}).entries || [];
    entries.forEach((e) => {
      (m[e.char] = m[e.char] || []).push({ reading: e.reading, pair: p, entry: e });
    });
  });
  return m;
})();

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 所有条目（扁平，指定音对） */
export function allEntries(pair: string): Entry[] {
  const p = DATA.pairs[pair];
  if (!p) return [];
  return p.entries;
}

export function totalEntries(): number {
  return PAIR_ORDER.reduce((s, p) => s + allEntries(p).length, 0);
}

/** 音对元信息（pair=null → 综合随机） */
export function pairMeta(pairName: string | null): {
  name: string;
  label: string;
  desc: string;
  color: string;
  totalEntries: number;
} {
  const p = pairName ? DATA.pairs[pairName] : undefined;
  return {
    name: pairName || "mix",
    label: p ? p.label : "综合随机",
    desc: p ? p.desc : "混合所有音对",
    color: p ? p.color : "#2563eb",
    totalEntries: p ? p.entries.length : 0,
  };
}

/** 已掌握记录/字卡 → 例词（词库未收录时回退为字本身） */
export function wordOf(m: { char: string; pair: string }): string {
  const entry = allEntries(m.pair).find((e) => e.char === m.char);
  if (entry && entry.words && entry.words[0]) return entry.words[0].word;
  return m.char;
}

/** 字在某音对下的权威读音（词库未收录时回退 "--"） */
export function readingOf(char: string, pair: string): string {
  const entry = allEntries(pair).find((e) => e.char === char);
  return entry ? entry.reading : "--";
}
