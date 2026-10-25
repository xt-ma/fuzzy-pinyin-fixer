/* ============================================================
   模糊音克星 · 轮次状态机（从 js/quiz.js 拆分，Round 由调用方持有）
   状态（含作答运行态）挂在 Round/Question 对象上；Zustand store
   （src/stores/quiz.ts）持有 Round 并驱动 React 重渲染。
   ============================================================ */
import { store, type HistoryRecord } from "./storage.ts";
import { buildQuestions, type PoolOpts, type Question, type QuestionRow, type QuizOption } from "./quiz.ts";

export interface WrongRec {
  char: string;
  word: string;
  correctPy: string;
  wrongPy: string;
  pair: string;
}

export interface Round {
  mode: "pair" | "mix";
  pair: string | null;
  questions: Question[];
  index: number;
  /** 本轮已到达的最大题位（回溯后用于判断是否在最新位置） */
  maxIndex: number;
  correctCount: number;
  wrongList: WrongRec[];
  startTime: number;
  source: string;
  infinite: boolean;
  /** 本轮已出过的考点（无限模式用于补题排重，char|reading 复合键） */
  seenChars: string[];
  opts: PoolOpts & { source?: string };
}

export interface RoundSummary {
  round: Round;
  total: number;
  correct: number;
  rate: number;
  wrongList: WrongRec[];
  durationSec: number;
  record: HistoryRecord;
}

export function startRound(mode: "pair" | "mix", pair: string | null, count: number | "infinite", opts: PoolOpts & { source?: string } = {}): Round {
  // count 为 "infinite" / Infinity 时为无限模式：不设上限，题目耗尽自动补题
  const infinite = count === "infinite" || count === Infinity;
  const n = infinite ? Infinity : count;
  const questions = buildQuestions(mode, pair, n, opts);
  return {
    mode,
    pair,
    questions,
    index: 0,
    maxIndex: 0,
    correctCount: 0,
    wrongList: [],
    startTime: Date.now(),
    source: opts.source ? opts.source : "normal",
    infinite,
    seenChars: [],
    opts,
  };
}

/** 无限模式补题：题库耗尽时重新洗牌补一批，优先排除本轮已出过的考点（字+读音） */
function refill(round: Round): void {
  let fresh = buildQuestions(round.mode, round.pair, Infinity, Object.assign({}, round.opts, { excludeChars: round.seenChars }));
  if (!fresh.length) {
    // 题库已全部练过一遍 → 清空记录，重新开始
    round.seenChars = [];
    fresh = buildQuestions(round.mode, round.pair, Infinity, round.opts);
  }
  round.questions = round.questions.concat(fresh);
}

export function currentQuestion(round: Round | null): Question | null {
  if (!round || round.index >= round.questions.length) return null;
  return round.questions[round.index];
}

/** 作答（单行题）：返回 {correct, q, wrongList} */
export function answer(round: Round, selectedOption: QuizOption): { correct: boolean; q: Question; wrongList: WrongRec[] } | null {
  const q = currentQuestion(round);
  if (!q) return null;
  const isCorrect = selectedOption.isCorrect;

  // 记录该题作答状态（供回溯时渲染"已答完"视图）
  q.answered = true;
  q.pick = selectedOption;

  // 完整记录本次作答（对错都记），供统计与 FSRS 记忆模型使用
  store.recordAnswer({
    char: q.char,
    pair: q.pair,
    rating: isCorrect ? 3 : 1, // FSRS rating：1=again(错) 3=good(对)
    word: q.word ? q.word.word : null,
    correctPy: q.correct.py,
    wrongPy: isCorrect ? null : selectedOption.py,
    mode: round.mode,
    source: round.source,
    fromFSRS: !!q.fromFSRS,
  });

  if (isCorrect) {
    round.correctCount += 1;
    // 若该字在错题本中，记录一次答对（连续 2 次自动移出）
    if (store.getWrongBook()[q.char]) {
      store.markWrongCorrect(q.char);
    }
  } else {
    round.wrongList.push({
      char: q.char,
      word: q.word ? q.word.word : q.char,
      correctPy: q.correct.py,
      wrongPy: selectedOption.py,
      pair: q.pair,
    });
    // 自动记入错题本
    store.addWrong({
      char: q.char,
      pair: q.pair,
      wrongPy: selectedOption.py,
      correctPy: q.correct.py,
      word: q.word ? q.word.word : q.char,
    });
  }
  return { correct: isCorrect, q, wrongList: round.wrongList };
}

/** 多行题：作答其中一行；整题完成前允许修改选择，
    作答流水统一在 commitQuestion 按最终选择记录（修改不重复计入统计） */
export function answerRow(round: Round, rowIndex: number, selectedOption: QuizOption): { correct: boolean; row: QuestionRow; q: Question } | null {
  const q = currentQuestion(round);
  if (!q || !q.rows) return null;
  const row = q.rows[rowIndex];
  if (!row) return null;
  const isCorrect = selectedOption.isCorrect;
  q.rowResults = q.rowResults || [];
  q.rowResults[rowIndex] = isCorrect;
  q.rowPicks = q.rowPicks || [];
  q.rowPicks[rowIndex] = selectedOption;
  return { correct: isCorrect, row, q };
}

/** 多行题：全部行作答完毕后提交，更新轮次统计（整题全对才算答对） */
export function commitQuestion(round: Round): { correct: boolean; q: Question; wrongList: WrongRec[] } | null {
  const q = currentQuestion(round);
  if (!q || !q.rows) return null;
  const results = q.rowResults || [];
  // 每个字按最终选择记录作答流水（整题完成前可修改，故延迟到提交时记录）
  q.rows.forEach((row, i) => {
    const pick = (q.rowPicks || [])[i];
    if (!pick) return;
    store.recordAnswer({
      char: row.char,
      pair: row.pair,
      rating: results[i] ? 3 : 1, // FSRS rating：1=again(错) 3=good(对)
      word: q.word ? q.word.word : null,
      correctPy: row.correct.py,
      wrongPy: results[i] ? null : pick.py,
      mode: round.mode,
      source: round.source,
      fromFSRS: !!q.fromFSRS,
    });
  });
  const allCorrect = results.length === q.rows.length && results.every(Boolean);
  if (allCorrect) {
    round.correctCount += 1;
    q.rows.forEach((row) => {
      if (store.getWrongBook()[row.char]) store.markWrongCorrect(row.char);
    });
  } else {
    q.rows.forEach((row, i) => {
      if (results[i]) return;
      const pick = (q.rowPicks || [])[i];
      round.wrongList.push({
        char: row.char,
        word: q.word ? q.word.word : row.char,
        correctPy: row.correct.py,
        wrongPy: pick ? pick.py : "",
        pair: row.pair,
      });
      store.addWrong({
        char: row.char,
        pair: row.pair,
        wrongPy: pick ? pick.py : "",
        correctPy: row.correct.py,
        word: q.word ? q.word.word : row.char,
      });
    });
  }
  return { correct: allCorrect, q, wrongList: round.wrongList };
}

export function next(round: Round): void {
  const q = round.questions[round.index];
  if (q) round.seenChars.push(q.char + "|" + (q.entry ? q.entry.reading : "")); // 复合键，补题按考点排重
  round.index += 1;
  round.maxIndex = Math.max(round.maxIndex, round.index);
  // 无限模式：题目耗尽时自动补一批
  if (round.infinite && round.index >= round.questions.length) {
    refill(round);
  }
}

/** 回溯：回到上一题（只读查看，不改统计） */
export function prev(round: Round): void {
  round.index = Math.max(0, round.index - 1);
}

/** 跳到指定题位（用于"继续作答"回到最新位置），clamp 到有效范围 */
export function jumpTo(round: Round, idx: number): void {
  const max = Math.min(round.maxIndex, Math.max(0, round.questions.length - 1));
  round.index = Math.max(0, Math.min(idx, max));
}

/** 是否处于最新位置（false = 正在回溯查看历史） */
export function isAtLatest(round: Round | null): boolean {
  return !round || round.index >= round.maxIndex;
}

export function isFinished(round: Round | null): boolean {
  // 无限模式永不自然结束，由用户主动结束
  if (round && round.infinite) return false;
  return !!round && round.index >= round.questions.length;
}

/** 结束轮次：写入 history 并产出复盘摘要 */
export function finishRound(round: Round): RoundSummary | null {
  if (!round) return null;
  const durationSec = Math.round((Date.now() - round.startTime) / 1000);
  // 无限模式统计实际答题数（而非动态增长的题目数组长度）
  const total = round.infinite ? round.correctCount + round.wrongList.length : round.questions.length;
  const record: HistoryRecord = {
    mode: round.mode,
    pair: round.pair,
    total,
    correct: round.correctCount,
    durationSec,
  };
  store.addHistory(record);
  return {
    round,
    total,
    correct: round.correctCount,
    rate: total ? Math.round((round.correctCount / total) * 100) : 0,
    wrongList: round.wrongList,
    durationSec,
    record,
  };
}
