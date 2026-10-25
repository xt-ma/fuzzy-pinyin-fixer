/* ============================================================
   模糊音克星 · 答题轮次 store（Zustand）
   移植 js/view-quiz.js 的编排语义：作答/回溯/自动切题（TTS 播完再计时）、
   已掌握标记（揭示正确项 + 仅最新题位自动前进）、无限模式补题、轮末复盘。
   纯状态转换可脱离 DOM 测试（scripts/test_features.ts）。
   ============================================================ */
import { create } from "zustand";
import { store as storage } from "../lib/storage.ts";
import type { Question } from "../lib/quiz.ts";
import {
  answer as roundAnswer,
  answerRow as roundAnswerRow,
  commitQuestion,
  currentQuestion,
  finishRound as roundFinishRound,
  isAtLatest,
  isFinished,
  jumpTo,
  next as roundNext,
  prev as roundPrev,
  startRound,
  type Round,
  type RoundSummary,
} from "../lib/round.ts";
import { tts } from "../lib/tts.ts";
import { useAppStore } from "./app.ts";
import { useUiStore } from "./ui.ts";

export type { Round, RoundSummary, Question };

interface QuizState {
  round: Round | null;
  summary: RoundSummary | null;
  /** 强制重渲染计数（Round/Question 为可变对象） */
  tick: number;

  /** 开启一轮；题目为空返回 null（视图负责提示并回首页） */
  start: (mode: "pair" | "mix", pair: string | null, count: number | "infinite", opts?: Record<string, unknown>) => Round | null;
  current: () => Question | null;
  /** 作答（单行/多行统一入口） */
  submit: (rowIndex: number, optIndex: number) => void;
  /** 答对后的「跳过」：立即下一题 */
  skip: () => void;
  next: () => void;
  prev: () => void;
  resume: () => void;
  /** 结束本轮（无限模式确认后 / 正常答完自动触发） */
  finish: () => void;
  /** 离开答题页：清理待切题计时与残留朗读 */
  onLeave: () => void;
  /** 单字题：切换当前题已掌握标记 */
  toggleMasteredSingle: () => void;
  /** 多字题：应用多选结果（勾选=标记，未勾选=撤回） */
  applyMasteredPicker: (chars: string[]) => void;
  toggleTts: () => void;
  /** 上一轮复盘（重练/再练一轮入口） */
  lastSummary: () => RoundSummary | null;
}

/* 模块级运行时（不进 React 状态） */
let autoNextTimer: ReturnType<typeof setTimeout> | null = null;
let quizSeq = 0; // 答题序号：切题时自增，使未完成的朗读回调失效（F6）

const ui = () => useUiStore.getState();
const app = () => useAppStore.getState();

function ttsTextOf(q: Question): string {
  return q.word ? q.word.word : q.char;
}

/** 当前题的所有考察字（多字题=全部行字，单行=目标字） */
export function masteredCharsOf(q: Question): string[] {
  return q.rows ? q.rows.map((r) => r.char) : [q.char];
}

/** 该题是否已作答完毕（回溯时据此渲染已答状态） */
export function isQuestionAnswered(q: Question | null): boolean {
  if (!q) return false;
  if (q.rows) {
    const results = q.rowResults || [];
    return results.length >= q.rows.length && q.rows.every((_, i) => results[i] !== undefined);
  }
  return !!q.answered;
}

export const useQuizStore = create<QuizState>((set, get) => {
  /* 内部：统一的自动下一题调度 */
  function scheduleNext(delay: number): void {
    clearTimeout(autoNextTimer!);
    autoNextTimer = setTimeout(() => get().next(), delay);
  }

  /* F6：作答后自动朗读 1 遍；scheduleNext 时等播完再启动 1 秒切题倒计时。
     TTS 关闭/不支持时行为与旧逻辑一致（立即计时/不计时） */
  function speakThen(q: Question, schedule: boolean): void {
    const seq = quizSeq;
    if (schedule) clearTimeout(autoNextTimer!);
    if (!tts.enabled()) {
      if (schedule) autoNextTimer = setTimeout(() => get().next(), 1000);
      return;
    }
    tts.speak(ttsTextOf(q)).then(() => {
      // 期间已切题/离开答题页则放弃调度，避免意外跳题
      if (seq !== quizSeq || ui().view !== "quiz") return;
      if (schedule) autoNextTimer = setTimeout(() => get().next(), 1000);
    });
  }

  function advance(): void {
    const round = get().round;
    if (!round) return;
    roundNext(round);
    if (isFinished(round)) {
      get().finish();
    } else {
      set((s) => ({ tick: s.tick + 1 }));
    }
  }

  return {
    round: null,
    summary: null,
    tick: 0,

    start: (mode, pair, count, opts = {}) => {
      quizSeq++;
      clearTimeout(autoNextTimer!);
      const finalOpts = Object.assign({}, opts, {
        source: opts.source || (count === "infinite" ? "infinite" : "normal"),
      });
      const round = startRound(mode, pair, count, finalOpts as never);
      if (!round.questions.length) {
        set({ round: null });
        return null;
      }
      set({ round, summary: null, tick: 0 });
      return round;
    },

    current: () => currentQuestion(get().round),

    submit: (rowIndex, optIndex) => {
      const round = get().round;
      if (!round) return;
      const q = currentQuestion(round);
      if (!q) return;
      if (isQuestionAnswered(q) || q.masteredRevealed) return; // 锁定态不可作答

      if (q.rows) {
        const row = q.rows[rowIndex];
        if (!row) return;
        const selected = row.options[optIndex];
        if (!selected) return;
        roundAnswerRow(round, rowIndex, selected);
        // 全部行答完 → 整题提交 + 反馈 + TTS
        if ((q.rowResults || []).filter((v) => v !== undefined).length >= q.rows.length) {
          const res = commitQuestion(round);
          app().refresh();
          if (res) speakThen(q, res.correct);
        }
        set((s) => ({ tick: s.tick + 1 }));
        return;
      }

      const selected = q.options[optIndex];
      if (!selected) return;
      const res = roundAnswer(round, selected);
      app().refresh();
      if (res) speakThen(q, res.correct); // 答对自动下一题；答错停留
      set((s) => ({ tick: s.tick + 1 }));
    },

    skip: () => {
      clearTimeout(autoNextTimer!);
      advance();
    },

    next: () => {
      quizSeq++;
      advance();
    },

    prev: () => {
      const round = get().round;
      if (!round || round.index <= 0) return;
      quizSeq++;
      clearTimeout(autoNextTimer!);
      roundPrev(round);
      set((s) => ({ tick: s.tick + 1 }));
    },

    resume: () => {
      const round = get().round;
      if (!round || isAtLatest(round)) return;
      quizSeq++;
      jumpTo(round, round.maxIndex);
      set((s) => ({ tick: s.tick + 1 }));
    },

    finish: () => {
      const round = get().round;
      if (!round) return;
      quizSeq++;
      clearTimeout(autoNextTimer!);
      tts.stop();
      const summary = roundFinishRound(round);
      app().refresh();
      set({ summary, tick: 0 });
      ui().navigate("result");
    },

    onLeave: () => {
      quizSeq++;
      clearTimeout(autoNextTimer!);
      tts.stop();
    },

    toggleMasteredSingle: () => {
      const round = get().round;
      if (!round) return;
      const q = currentQuestion(round);
      if (!q) return;
      const char = q.char;
      const pair = q.rows ? q.rows[0].pair : q.pair;
      if (storage.isMastered(char)) {
        storage.removeMastered(char);
        // 未作答时撤回已掌握 → 选项复原（去掉揭示效果）
        if (q.masteredRevealed && !isQuestionAnswered(q)) q.masteredRevealed = false;
        clearTimeout(autoNextTimer!);
        app().refresh();
        ui().toast("已撤回「" + char + "」的已掌握");
      } else {
        storage.addMastered(char, pair);
        // 揭示正确选项（未作答时点已掌握 = 跳过本题）
        if (!isQuestionAnswered(q)) {
          q.masteredRevealed = true;
          q.masteredRevealChars = [char];
        }
        app().refresh();
        ui().toast("已标记「" + char + "」为已掌握");
        // 仅在最新题位自动前进；回溯查看历史时留在原地
        if (isAtLatest(round)) scheduleNext(1000);
      }
      set((s) => ({ tick: s.tick + 1 }));
    },

    applyMasteredPicker: (chars) => {
      const round = get().round;
      if (!round) return;
      const q = currentQuestion(round);
      if (!q || !q.rows) return;
      const picked = new Set(chars);
      q.rows.forEach((row) => {
        if (picked.has(row.char) && !storage.isMastered(row.char)) {
          storage.addMastered(row.char, row.pair);
        } else if (!picked.has(row.char) && storage.isMastered(row.char)) {
          storage.removeMastered(row.char);
        }
      });
      if (picked.size) {
        if (!isQuestionAnswered(q)) {
          q.masteredRevealed = true;
          q.masteredRevealChars = Array.from(picked);
        }
        app().refresh();
        ui().toast("已标记 " + picked.size + " 个字为已掌握");
        // 仅在最新题位自动前进；回溯查看历史时留在原地
        if (isAtLatest(round)) scheduleNext(1000);
      } else {
        if (q.masteredRevealed && !isQuestionAnswered(q)) q.masteredRevealed = false;
        clearTimeout(autoNextTimer!);
        app().refresh();
        ui().toast("已撤回全部已掌握标记");
      }
      set((s) => ({ tick: s.tick + 1 }));
    },

    toggleTts: () => {
      if (!tts.supported()) return;
      const on = !tts.enabled();
      tts.setEnabled(on);
      app().refresh();
      ui().toast(on ? "朗读已开启" : "朗读已关闭");
    },

    lastSummary: () => get().summary,
  };
});

/** 非 React 上下文（测试）使用的便捷访问 */
export const quizStore = useQuizStore;
