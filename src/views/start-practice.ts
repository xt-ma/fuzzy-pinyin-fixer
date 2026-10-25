/* 练习入口编排（对应旧版 App.startQuiz 系列）：开轮 → 空池确认 → 导航 */
import { store as storage } from "../lib/storage.ts";
import { useAppStore } from "../stores/app.ts";
import { useQuizStore } from "../stores/quiz.ts";
import { useUiStore } from "../stores/ui.ts";

export function startPractice(
  mode: "pair" | "mix",
  pair: string | null,
  opts: { count?: number | "infinite"; onlyChars?: string[]; source?: string } = {},
): void {
  const settings = useAppStore.getState().settings;
  const count = opts.count !== undefined ? opts.count : (settings.defaultCount ?? 10);
  const round = useQuizStore.getState().start(mode, pair, count as number | "infinite", opts);
  const ui = useUiStore.getState();
  if (!round) {
    const msg = (opts.onlyChars ? "该字已掌握或不存在于词库" : "题库已清空（可能都已掌握）") + "，可去「已掌握」撤回后重试";
    ui.confirm("没有可用题目", msg).then(() => ui.navigate("home"));
    return;
  }
  ui.navigate("quiz");
}

/** 错题本一键重练：排除已掌握而隐藏的记录；显式按错题数量出题（防无限循环） */
export function startWrongbookPractice(): void {
  const ui = useUiStore.getState();
  const wb = storage.getWrongBook();
  const chars = Object.keys(wb).filter((c) => !wb[c].hidden);
  if (!chars.length) {
    ui.toast("错题本是空的");
    return;
  }
  startPractice("mix", null, { onlyChars: chars, count: chars.length, source: "wrongbook" });
}

/** 单字重练（错题本/薄弱字入口） */
export function practiceOne(char: string, pair: string): void {
  startPractice("pair", pair, { onlyChars: [char], source: "wrongbook", count: 1 });
}

/** 轮末复盘 → 错题重练 */
export function retryWrong(): void {
  const s = useQuizStore.getState().lastSummary();
  if (!s || !s.wrongList.length) return;
  const chars = s.wrongList.map((w) => w.char);
  startPractice(s.round.mode === "pair" ? "pair" : "mix", s.round.pair, {
    onlyChars: chars,
    count: chars.length,
    source: "retry",
  });
}

/** 轮末复盘 → 再练一轮 */
export function again(): void {
  const s = useQuizStore.getState().lastSummary();
  if (!s) return;
  startPractice(s.round.mode === "pair" ? "pair" : "mix", s.round.pair);
}
