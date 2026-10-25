/* ============================================================
   功能测试（逻辑 + store 层，移植自 scripts/test_features.js 的 DOM 桩版）
   覆盖：已掌握标记/撤回/多选/错题本 hidden 联动 / 上一题回溯与继续作答 /
         回溯态标记不自动前进（仅最新题位调度）/ 薄弱字排序 / 错题过滤
   React 视图层（渲染/键盘监听）由 test_mobile.ts 静态检查覆盖。
   运行：node scripts/test_features.ts
   ============================================================ */

export {}; // 标记为 ES 模块（顶层 await 需要）
let pass = 0, fail = 0;
function ok(cond: unknown, name: string) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; console.error("  ✘", name); }
}

/* ---------- 环境：mock localStorage + 手动定时器（自动切题不真跑，可断言是否调度） ---------- */
const mem: Record<string, string> = {};
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
} as Storage;
const scheduled: (null | (() => unknown))[] = [];
(globalThis as { setTimeout?: unknown }).setTimeout = ((fn: () => unknown) => {
  scheduled.push(fn);
  return scheduled.length; // id = 槽位下标 + 1（与 clearTimeout 严格对应）
}) as never;
(globalThis as { clearTimeout?: unknown }).clearTimeout = ((id: number) => {
  if (id >= 1 && id <= scheduled.length) scheduled[id - 1] = null;
}) as never;
const pendingTimers = () => scheduled.filter(Boolean).length;
const runTimers = async () => {
  for (let guard = 0; guard < 10; guard++) {
    // 取当前待执行槽位并立刻置空（保留 id 对应关系），逐个同步执行
    const idx = scheduled.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) break;
    for (const i of idx) {
      const fn = scheduled[i]!;
      scheduled[i] = null;
      await fn();
    }
  }
};

const { store } = await import("../src/lib/storage.ts");
const { makeQuestion } = await import("../src/lib/quiz.ts");
const { weakCardsOf, activeWrongItems } = await import("../src/lib/stats.ts");
const { useQuizStore } = await import("../src/stores/quiz.ts");
const { useUiStore } = await import("../src/stores/ui.ts");

/* 静默 toast：其自动消失计时器会混入调度计数（计数只反映自动切题调度） */
useUiStore.setState({ toast: () => {} });

const quiz = useQuizStore.getState();

/* 造题辅助：确定性条目（同旧版 T1/T4/T7） */
function entryOf(char: string, pair: string, correct: { py: string; tag: string }, wrong: { py: string; tag: string }, words: { word: string; pinyin: string }[]) {
  return { char, reading: correct.py, type: correct.tag, options: { correct, wrong }, words };
}
const ding = entryOf("盯", "in/ing", { py: "dīng", tag: "ing" }, { py: "dīn", tag: "in" }, [{ word: "盯住", pinyin: "dīng zhù" }]);
const la = entryOf("辣", "l/n", { py: "là", tag: "l" }, { py: "nà", tag: "n" }, [{ word: "辣椒", pinyin: "là jiāo" }]);

function startWithQuestions(entries: typeof ding[], opts: Record<string, unknown> = {}) {
  const round = quiz.start("mix", null, entries.length, { source: "feat", ...opts });
  if (!round) throw new Error("start failed");
  round.questions = entries.map((e) => makeQuestion({ ...e, pairName: e.options.correct.tag === "l" || e.options.correct.tag === "n" ? "l/n" : "in/ing" }));
  return round;
}

console.log("== 功能测试：已掌握标记 + 回溯 ==");

/* T1 单字题：标记成功 / 揭示正确项（masteredRevealed） / 撤回复原 */
store.clearAll();
{
  const round = startWithQuestions([ding, ding, ding, ding]);
  const q0 = quiz.current()!;
  ok(!q0.rows && !store.isMastered(q0.char), "T1 初始未标记");
  quiz.toggleMasteredSingle();
  ok(store.isMastered(q0.char), "T1 未作答点已掌握 → 标记成功");
  ok(q0.masteredRevealed === true, "T1 揭示正确选项（masteredRevealed）");
  ok(pendingTimers() === 1, "T1 标记后调度自动前进（最新题位）");
  quiz.toggleMasteredSingle();
  ok(!store.isMastered(q0.char), "T1 再次点击 → 撤回成功");
  ok(q0.masteredRevealed === false, "T1 撤回后选项复原（去掉揭示）");
}

/* T2 作答后标记 + 错题本 hidden 联动 */
{
  await runTimers(); // 冲掉 T1 残留调度
  const round = useQuizStore.getState().round!;
  quiz.next();
  const q1 = quiz.current()!;
  const wIdx = q1.options.findIndex((o) => !o.isCorrect);
  quiz.submit(0, wIdx);
  ok(!!store.getWrongBook()[q1.char] && !store.getWrongBook()[q1.char].hidden, "T2 答错进错题本（可见）");
  quiz.toggleMasteredSingle();
  ok(store.isMastered(q1.char), "T2 标记已掌握");
  ok(!!store.getWrongBook()[q1.char] && store.getWrongBook()[q1.char].hidden, "T2 错题本条目置为失效（hidden 保留）");
  quiz.toggleMasteredSingle();
  ok(!store.isMastered(q1.char), "T2 撤回已掌握");
  ok(!!store.getWrongBook()[q1.char] && !store.getWrongBook()[q1.char].hidden, "T2 撤回后错题本恢复可见");
  ok(!(store.getWrongBook()[q1.char].count < 1), "T2 错题次数未丢失");
}

/* T3 上一题回溯：已答状态 / 继续作答 */
{
  await runTimers();
  const round = useQuizStore.getState().round!;
  quiz.prev();
  ok(round.index === 0, "T3 回溯到第 1 题");
  const q0 = quiz.current()!;
  ok(!q0.answered, "T3 第 1 题未作答（回溯态可重新作答）");
  quiz.resume();
  ok(round.index === 1, "T3 继续作答回到最新题");
  const q1b = quiz.current()!;
  ok(!!q1b.answered && !!q1b.pick, "T3 已答题保留作答状态（answered/pick）");
  ok(q1b.pick === q1b.options.find((o) => !o.isCorrect), "T3 保留的是错误选择（回溯渲染标红依据）");
}

/* T4 多字题已掌握多选（新娘 → 娘+新 两行） */
store.clearAll();
{
  const niang = entryOf("娘", "l/n", { py: "niáng", tag: "n" }, { py: "liáng", tag: "l" }, [{ word: "新娘", pinyin: "xīn niáng" }]);
  const round = quiz.start("mix", null, 2, { source: "feat" });
  round!.questions = [makeQuestion({ ...niang, pairName: "l/n" }), makeQuestion({ ...niang, pairName: "l/n" })];
  const qm = quiz.current()!;
  ok(!!qm.rows && qm.rows!.length === 2, "T4 多字题 2 行");
  // 模拟多选：只勾选第一行字
  quiz.applyMasteredPicker([qm.rows![0].char]);
  ok(store.isMastered(qm.rows![0].char) && !store.isMastered(qm.rows![1].char), "T4 仅勾选的字被标记");
  ok(qm.masteredRevealed === true && qm.masteredRevealChars!.includes(qm.rows![0].char), "T4 揭示勾选字的正确项");
  ok(!qm.masteredRevealChars!.includes(qm.rows![1].char), "T4 未勾选字不揭示");
  // 全不勾选 → 撤回全部
  quiz.applyMasteredPicker([]);
  ok(!store.isMastered(qm.rows![0].char), "T4 空选 → 撤回全部标记");
}

/* T5 无限模式回溯 */
store.clearAll();
{
  const round = quiz.start("mix", null, "infinite", { source: "feat" });
  round!.questions = [makeQuestion({ ...ding, pairName: "in/ing" }), makeQuestion({ ...ding, pairName: "in/ing" })];
  quiz.next();
  quiz.prev();
  ok(round!.index === 0, "T5 无限模式回溯到第 1 题");
  quiz.resume();
  ok(round!.index === 1, "T5 无限模式继续作答");
}

/* T6 错题本过滤：hidden 不参与重练与展示 */
store.clearAll();
{
  store.addWrong({ char: "盯", pair: "in/ing", wrongPy: "dīn", correctPy: "dīng", word: "盯住" });
  store.addWrong({ char: "娘", pair: "l/n", wrongPy: "liáng", correctPy: "niáng", word: "新娘" });
  store.addMastered("盯", "in/ing"); // 盯 hidden
  const items = activeWrongItems();
  ok(items.every((it) => it.char !== "盯"), "T6 错题列表隐藏已掌握失效条目");
  ok(items.some((it) => it.char === "娘"), "T6 未失效条目正常显示");
  store.removeMastered("盯");
  ok(store.getWrongBook()["盯"].hidden === false, "T6 撤回后错题记录恢复");
}

/* T7 回溯态标记已掌握：不自动前进（自动前进调度只发生在最新题位） */
store.clearAll();
{
  await runTimers();
  const round = startWithQuestions([ding, la, ding]);
  const qa = quiz.current()!;
  quiz.submit(0, qa.options.findIndex((o) => !o.isCorrect));
  quiz.next();
  ok(round.index === 1, "T7 答错后前进到第 2 题");
  quiz.prev();
  ok(round.index === 0, "T7 回溯到第 1 题");
  const schedBefore = pendingTimers();
  quiz.toggleMasteredSingle(); // 回溯态标记已掌握
  ok(store.isMastered(qa.char), "T7 回溯态标记成功");
  ok(round.index === 0, "T7 回溯态标记后不自动前进");
  ok(pendingTimers() === schedBefore, "T7 回溯态未调度自动切题");
  // 回到最新题位再标记 → 恢复「1 秒后自动下一题」调度
  quiz.resume();
  ok(round.index === 1, "T7 继续作答回到最新题");
  store.removeMastered("辣");
  quiz.toggleMasteredSingle();
  ok(store.isMastered("辣"), "T7 最新题位标记成功");
  ok(pendingTimers() === schedBefore + 1, "T7 最新题位标记后调度自动前进");
}

/* T8 轮末复盘入口数据（retryWrong/again 依赖 summary.round 保留） */
store.clearAll();
{
  await runTimers();
  const round = startWithQuestions([ding]);
  const q = quiz.current()!;
  quiz.submit(0, q.options.findIndex((o) => o.isCorrect));
  quiz.finish();
  const s = useQuizStore.getState().summary;
  ok(!!s && s.total === 1 && s.correct === 1, "T8 复盘摘要生成（total/correct）");
  ok(!!s && s.round === round, "T8 summary.round 保留（错题重练/再练一轮入口）");
  ok(store.getHistory().length === 1, "T8 history 写入 1 条");
}

/* T9 薄弱字 TOP 排行（cards 聚合，按累计错误次数排序） */
store.clearAll();
{
  store.recordAnswer({ char: "乙", pair: "in/ing", rating: 1, word: "乙词", correctPy: "yǐ", mode: "mix", source: "t" });
  store.recordAnswer({ char: "丙", pair: "l/n", rating: 3, word: "丙词", correctPy: "bǐng", mode: "mix", source: "t" });
  store.recordAnswer({ char: "甲", pair: "l/n", rating: 1, word: "甲词", correctPy: "jiǎ", mode: "mix", source: "t" });
  store.recordAnswer({ char: "甲", pair: "l/n", rating: 1, word: "甲词", correctPy: "jiǎ", mode: "mix", source: "t" });
  const weak = weakCardsOf(10);
  ok(weak.length === 2, "T9 薄弱字聚合（只含答错过的字）");
  ok(weak[0].char === "甲" && weak[1].char === "乙", "T9 错 2 次的甲排在错 1 次的乙之前");
  ok(!weak.some((c) => c.char === "丙"), "T9 只对不错的丙不进榜单");
}

/* T10 首页统计辅助（trendDelta/overallRateOf 存在且可算） */
store.clearAll();
{
  store.addHistory({ mode: "mix", pair: null, total: 10, correct: 8, durationSec: 60 });
  const { statsOf, trendDelta, overallRateOf } = await import("../src/lib/stats.ts");
  const stats = statsOf(7);
  ok(stats.total === 10 && stats.totalRate === 80, "T10 statsOf 聚合正确");
  ok(overallRateOf(stats) === 80, "T10 综合随机正确率计算");
  ok(trendDelta(stats, 7) === null || typeof trendDelta(stats, 7) === "number", "T10 趋势差值可计算");
}

/* T11 UI store：confirm Promise 语义（视图流程的确认地基） */
{
  const ui = useUiStore.getState();
  let resolved: boolean | null = null;
  const p = ui.confirm("标题", "说明").then((v) => { resolved = v; });
  ok(useUiStore.getState().confirmReq !== null, "T11 confirm 弹出请求");
  useUiStore.getState().resolveConfirm(true);
  await p;
  ok(resolved === true, "T11 resolveConfirm(true) 回传结果");
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
