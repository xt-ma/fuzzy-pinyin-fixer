/* ============================================================
   模糊音克星 · 题目生成（从 js/quiz.js 拆分，纯函数 + storage 读取）
   轮次状态机见 src/lib/round.ts
   ============================================================ */
import { store } from "./storage.ts";
import {
  CHAR_LOOKUP,
  PAIR_ORDER,
  allEntries,
  shuffle,
  type Entry,
  type PyTag,
  type WordItem,
} from "./words.ts";
import { diffKeyOf, stripTone, swapInitial, swapVowel, tagOf, vowelGroup } from "./pinyin.ts";

const MAX_ROWS = 4; // 一道词题最多同时考察的字数（含目标字）

/* ---------- 题目类型 ---------- */

export interface QuizOption extends PyTag {
  isCorrect: boolean;
}

export interface QuestionRow {
  char: string;
  pair: string;
  correct: PyTag;
  options: QuizOption[];
  diffVowel: string;
  diffKey: string;
}

/** 一道题（word 为随机选出的题干词语；rows 非空时为多字题） */
export interface Question {
  char: string;
  pair: string;
  entry: Entry & { pairName?: string };
  word: WordItem | null;
  isWordQuestion: boolean;
  correct: PyTag;
  options: QuizOption[];
  diffVowel: string;
  diffKey: string;
  fromFSRS: boolean;
  rows: QuestionRow[] | null;
  /* ---- 作答运行态（round 过程中写入） ---- */
  answered?: boolean;
  pick?: QuizOption;
  rowResults?: boolean[];
  rowPicks?: QuizOption[];
  /** 未作答时点「已掌握」→ 揭示正确项（跳过本题） */
  masteredRevealed?: boolean;
  /** 已掌握揭示的字集（多字题部分揭示） */
  masteredRevealChars?: string[];
}

export interface PoolOpts {
  /** 来源字集（错题重练/单字重练） */
  onlyChars?: string[];
  /** 排除考点（char|reading 复合键，无限模式补题排除本轮已出考点） */
  excludeChars?: string[];
}

/* ---------- 条目池构建 ---------- */

/** 条目池：按模式取条目 + 排除已掌握 + onlyChars/excludeChars 过滤 + 按 (字,读音) 去重。
    去重粒度为 (char, reading)：多音字的不同读音是不同考点（如 尽 jǐn/jìn），均可出题；
    已掌握仍按字整体排除（store.addMastered 按字标记）。 */
export function entryPool(mode: "pair" | "mix", pair: string | null, opts: PoolOpts): (Entry & { pairName: string })[] {
  opts = opts || {};
  const mastered = store.getMastered();
  let pool: (Entry & { pairName: string })[] = [];

  if (mode === "pair") {
    pool = allEntries(pair as string).map((e) => Object.assign({}, e, { pairName: pair as string }));
  } else {
    PAIR_ORDER.forEach((p) => {
      pool = pool.concat(allEntries(p).map((e) => Object.assign({}, e, { pairName: p })));
    });
  }

  // 排除已掌握字
  pool = pool.filter((e) => !mastered[e.char]);

  // 若指定了来源字集（错题重练/单字重练），进一步过滤
  if (opts.onlyChars) {
    const set = new Set(opts.onlyChars);
    pool = pool.filter((e) => set.has(e.char));
  }
  // 排除指定考点（补题时不再重复本轮已出过的 字+读音）
  if (opts.excludeChars) {
    const set = new Set(opts.excludeChars);
    pool = pool.filter((e) => !set.has(e.char + "|" + e.reading));
  }

  // 同一轮内不重复同一考点：按 (字,读音) 去重
  const seen = new Set<string>();
  const dedup: (Entry & { pairName: string })[] = [];
  for (const e of pool) {
    const key = e.char + "|" + e.reading;
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(e);
    }
  }
  return dedup;
}

/* ---------- 出题入口 ---------- */

/** 生成题目：mode = 'pair' 专项 | 'mix' 综合
    FSRS 开关开启 → 到期复习队列优先 + 随机补充（fromFSRS=true）；
    关闭 → 纯随机旧逻辑（可回滚） */
export function buildQuestions(
  mode: "pair" | "mix",
  pair: string | null,
  count: number | "infinite",
  opts: PoolOpts = {},
): Question[] {
  if (store.getSettings().enableFSRS) {
    return buildQuestionsFSRS(mode, pair, count, opts);
  }
  return buildQuestionsRandom(mode, pair, count, opts);
}

/** [deprecated] 纯随机出题（旧逻辑，FSRS 关闭时回滚用，保留勿删） */
export function buildQuestionsRandom(
  mode: "pair" | "mix",
  pair: string | null,
  count: number | "infinite",
  opts: PoolOpts = {},
): Question[] {
  const dedup = entryPool(mode, pair, opts);
  const questions = shuffle(dedup)
    .slice(0, count as number)
    .map((e) => makeQuestion(e));
  return questions;
}

/** FSRS 出题：到期队列（due<=now 且未被掌握/排除）优先，交错随机；不足再随机补新字 */
function buildQuestionsFSRS(
  mode: "pair" | "mix",
  pair: string | null,
  count: number | "infinite",
  opts: PoolOpts,
): Question[] {
  const pool = entryPool(mode, pair, opts);
  // char → 该字的全部读音条目（到期卡片按字命中，双读音字两个考点都可入批）
  const poolByChar = new Map<string, (Entry & { pairName: string })[]>();
  for (const e of pool) {
    if (!poolByChar.has(e.char)) poolByChar.set(e.char, []);
    poolByChar.get(e.char)!.push(e);
  }
  const countNum = isFinite(count as number) ? (count as number) : 20; // 无限模式按批 20 题
  const now = Date.now();

  // 到期复习队列（交错随机，保证相似字不扎堆）
  const dueEntries = store
    .getDueKeys(now, 2000)
    .filter((d) => poolByChar.has(d.char))
    .flatMap((d) => poolByChar.get(d.char)!);

  const questions: Question[] = [];
  const used = new Set<string>(); // (char,reading) 复合键去重
  const pick = (e: Entry & { pairName: string; fromFSRS?: boolean }, fromFSRS: boolean) => {
    const key = e.char + "|" + e.reading;
    if (used.has(key)) return;
    used.add(key);
    questions.push(makeQuestion(Object.assign({}, e, { fromFSRS })));
  };
  for (const e of shuffle(dueEntries)) {
    if (questions.length >= countNum) break;
    pick(e, true);
  }
  // 不足：随机补充未到期/新字
  if (questions.length < countNum) {
    for (const e of shuffle(pool)) {
      if (questions.length >= countNum) break;
      pick(e, false);
    }
  }
  return questions;
}

/* ---------- 选项构造 ---------- */

/** 构造选项：
    双音对字（读音同时命中鼻音韵母组 + l/n 声母，如「凝」níng）→ 4 选项：
      正确 + 韵母混淆（nin）+ 声母混淆（ling）+ 双重混淆（lin）
    其余 → 2 选项（正确 + 条目预设错误音） */
export function buildOptions(entry: Entry): QuizOption[] {
  const correct = entry.options.correct;
  const vowel = vowelGroup(correct.py);
  const body = stripTone(correct.py);
  const hasLNA = body[0] === "l" || body[0] === "n";
  if (vowel && hasLNA) {
    const v = swapVowel(correct.py);
    const s = swapInitial(correct.py);
    const vs = swapInitial(v);
    return shuffle<QuizOption>([
      { py: correct.py, tag: tagOf(correct.py), isCorrect: true },
      { py: v, tag: tagOf(v), isCorrect: false },
      { py: s, tag: tagOf(s), isCorrect: false },
      { py: vs, tag: tagOf(vs), isCorrect: false },
    ]);
  }
  return shuffle<QuizOption>([
    { ...correct, isCorrect: true },
    { ...entry.options.wrong, isCorrect: false },
  ]);
}

/** 构造一题
    wordOverride（可选）：指定题干词语，供测试确定性构造多字题；缺省随机选词 */
export function makeQuestion(entry: Entry & { pairName?: string; fromFSRS?: boolean }, wordOverride?: WordItem): Question {
  // 随机选词（词语题）；极少数无词条时退化为单字题
  const words = entry.words || [];
  let word: WordItem | null = null;
  if (wordOverride) {
    word = wordOverride;
  } else if (words.length > 0) {
    word = words[Math.floor(Math.random() * words.length)];
  }

  // 选项：correct + wrong（双音对字为 4 选项），随机顺序
  const correct = entry.options.correct;
  const order = buildOptions(entry);

  const q: Question = {
    char: entry.char,
    pair: (entry.pairName || "") as string,
    entry: entry,
    word: word,
    isWordQuestion: !!word,
    correct: correct,
    options: order,
    diffVowel: vowelGroup(correct.py) || (entry.pairName || ""), // 4 选项时按韵母维度高亮
    diffKey: diffKeyOf(entry.pairName || "", correct.tag), // 差异高亮
    fromFSRS: !!entry.fromFSRS, // 是否来自 FSRS 到期复习队列
    rows: null, // 多行题时填充
  };

  // 词语题：把词中其他可考字也纳入考察（如「新娘」→ 新(xin/xing) + 娘(niang/liang)）
  // rows 按词中字的位置排列（保持用户阅读顺序）
  if (word && word.pinyin) {
    const pys = String(word.pinyin).trim().split(/\s+/);
    const chars = Array.from(word.word);
    if (chars.length === pys.length && chars.length > 1) {
      const rows: QuestionRow[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < chars.length && rows.length < MAX_ROWS; i++) {
        const c = chars[i];
        if (seen.has(c)) continue; // 去重（如「仅仅」）
        if (c === q.char) {
          rows.push({ char: q.char, pair: q.pair, correct: q.correct, options: q.options, diffKey: q.diffKey, diffVowel: q.diffVowel });
          seen.add(c);
          continue;
        }
        const hit = (CHAR_LOOKUP[c] || []).find((h) => h.reading === pys[i]); // 按词内实际读音精确匹配
        if (!hit) continue;
        seen.add(c);
        const e = hit.entry;
        const cCorrect = e.options.correct;
        rows.push({
          char: c,
          pair: hit.pair,
          correct: cCorrect,
          options: buildOptions(e),
          diffVowel: vowelGroup(cCorrect.py) || hit.pair,
          diffKey: diffKeyOf(hit.pair, cCorrect.tag),
        });
      }
      if (rows.length > 1) q.rows = rows;
    }
  }
  return q;
}
