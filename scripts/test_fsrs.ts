/* ============================================================
   模糊音克星 · FSRS 记忆调度测试（移植自 scripts/test_fsrs.js）
   覆盖：公式性质 / review 状态机 / recordAnswer 集成 / 到期队列出题 / 回滚切换
   运行：node scripts/test_fsrs.ts
   ============================================================ */

export {}; // 标记为 ES 模块（顶层 await 需要）
let pass = 0, fail = 0;
function ok(cond: unknown, name: string) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ FAIL: " + name); }
}

/* ---------- 环境（import 前注入） ---------- */
const mem: Record<string, string> = {};
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
} as Storage;

const FSRS = await import("../src/lib/fsrs.ts");
const { store } = await import("../src/lib/storage.ts");
const { buildQuestions } = await import("../src/lib/quiz.ts");

// 固定 fuzz 与时间基准，保证确定性
FSRS.setFuzz(() => 0);
const NOW = 1700000000000;
const DAY = FSRS.DAY_MS;

console.log("== 1. FSRS 公式性质 ==");
{
  ok(Math.abs(FSRS.initStability(3) - 2.31) < 1e-6, "initStability(good)=2.31（w[2]=2.3065 舍入 2 位）");
  ok(Math.abs(FSRS.initStability(1) - 0.21) < 1e-6, "initStability(again)=0.21（w[0]=0.212 舍入 2 位）");
  const dEasy = FSRS.initDifficulty(4);
  ok(dEasy >= 1 && dEasy <= 10, "initDifficulty(easy) 夹取到 [1,10]: " + dEasy);
  // 遗忘曲线：R(t=0) ≈ 1；R 随 elapsed 递减
  ok(Math.abs(FSRS.forgettingCurve(0, 5) - 1) < 1e-9, "forgettingCurve(0)=1");
  ok(FSRS.forgettingCurve(10, 5) < FSRS.forgettingCurve(1, 5), "遗忘曲线随时间递减");
  // 稳定性越大，同一天 R 越高
  ok(FSRS.forgettingCurve(5, 20) > FSRS.forgettingCurve(5, 2), "稳定性越高，保留率越高");
  // 间隔单调：hard <= good <= easy（fuzz=0 时由公式保证）
  const base = { state: 2, stability: 5, difficulty: 5, due: NOW, lastTs: NOW - 3 * DAY };
  const rH = FSRS.review(base, 2, NOW);
  const rG = FSRS.review(base, 3, NOW);
  const rE = FSRS.review(base, 4, NOW);
  ok(
    rH.scheduledDays <= rG.scheduledDays && rG.scheduledDays <= rE.scheduledDays,
    `间隔单调 hard(${rH.scheduledDays})<=good(${rG.scheduledDays})<=easy(${rE.scheduledDays})`,
  );
}

console.log("== 2. review 状态机 ==");
{
  // 新卡首次 good → review，due 在未来
  const c1 = FSRS.review({ state: 0, stability: null, difficulty: null, due: null, lastTs: null }, 3, NOW);
  ok(c1.state === 2, "新卡首次答对 → state=2(review)");
  ok(c1.due > NOW && c1.scheduledDays >= 1, `due 在未来，scheduledDays>=1（${c1.scheduledDays} 天）`);
  ok(c1.stability > 0 && c1.difficulty >= 1 && c1.difficulty <= 10, "stability/difficulty 有效");

  // 新卡首次 again → relearning
  const c2 = FSRS.review({ state: 0, stability: null, difficulty: null, due: null, lastTs: null }, 1, NOW);
  ok(c2.state === 3, "新卡首次答错 → state=3(relearning)");

  // review 卡连续答对：间隔递增
  const r1 = FSRS.review({ state: 0, stability: null, difficulty: null, due: null, lastTs: null }, 3, NOW);
  const r2 = FSRS.review({ state: r1.state, stability: r1.stability, difficulty: r1.difficulty, due: r1.due, lastTs: NOW }, 3, NOW + 5 * DAY);
  ok(r2.scheduledDays > r1.scheduledDays, `复习间隔递增（${r1.scheduledDays} → ${r2.scheduledDays} 天）`);
  ok(r2.state === 2, "复习答对保持 review");

  // review 卡答错：稳定性下降、间隔缩短、转 relearning
  const r3 = FSRS.review({ state: 2, stability: r2.stability, difficulty: r2.difficulty, due: r2.due, lastTs: NOW + 5 * DAY }, 1, NOW + 10 * DAY);
  ok(r3.state === 3, "复习答错 → state=3(relearning)");
  ok(r3.stability < r2.stability, `答错稳定性下降（${r2.stability} → ${r3.stability}）`);
  ok(r3.scheduledDays <= r2.scheduledDays, `答错间隔不增（${r3.scheduledDays} <= ${r2.scheduledDays}）`);
}

console.log("== 3. recordAnswer 集成（FSRS 开/关） ==");
{
  store.clearAll();
  store.setSettings({ enableFSRS: true });
  store.recordAnswer({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn", mode: "mix", source: "test" });
  const card = store.getCards()["in/ing:印"];
  ok(!!card && card.due != null && card.due! > Date.now(), "FSRS 开启：作答后卡片写入 due");
  ok(card.state === 2 && (card.stability as number) > 0 && (card.difficulty as number) >= 1, "FSRS 开启：state/stability/difficulty 已更新");
  ok(store.getDueKeys(Date.now(), 10).length === 0, "刚答完未到期 → 待复习队列为空");

  // 关闭 FSRS：作答后不写 due（回滚）
  store.clearAll();
  store.setSettings({ enableFSRS: false });
  store.recordAnswer({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn", mode: "mix", source: "test" });
  const card2 = store.getCards()["in/ing:印"];
  ok(!!card2 && card2.due == null && card2.state === 0, "FSRS 关闭：卡片保持初始状态（due=null）");
  ok(store.getDueKeys(Date.now(), 10).length === 0, "FSRS 关闭：无到期队列");
  store.setSettings({ enableFSRS: true });
}

console.log("== 4. 到期队列出题 ==");
{
  store.clearAll();
  store.setSettings({ enableFSRS: true });
  // 造一张到期卡（印，due 在过去）
  store.set("cards", {
    "in/ing:印": { char: "印", pair: "in/ing", state: 2, stability: 5, difficulty: 5, due: Date.now() - 1000, scheduledDays: 3, reps: 2, correctCount: 1, wrongCount: 1, firstTs: 1000, lastTs: Date.now() - 86400000, lastRating: 3 },
  });
  const qs = buildQuestions("mix", null, 3, {});
  const yin = qs.find((q) => q.char === "印");
  ok(!!yin, "到期字「印」进入出题池");
  ok(yin!.fromFSRS === true, "到期字标记 fromFSRS=true");
  ok(qs.filter((q) => q.fromFSRS).length === 1, "仅 1 张到期卡被优先（其余为随机补充）");
  ok(qs.filter((q) => !q.fromFSRS).length === 2, "不足部分由随机补充（fromFSRS=false）");

  // count=1 时只出到期卡
  const qs1 = buildQuestions("mix", null, 1, {});
  ok(qs1.length === 1 && qs1[0].char === "印" && qs1[0].fromFSRS, "count=1 时到期卡优先输出");

  // 到期卡的字已掌握 → 被过滤
  store.addMastered("印", "in/ing");
  const qs2 = buildQuestions("mix", null, 1, {});
  ok(!qs2.some((q) => q.char === "印"), "到期但已掌握的字不再出题");
  store.removeMastered("印");
}

console.log("== 5. 回滚切换（开/关/开） ==");
{
  store.clearAll();
  store.setSettings({ enableFSRS: true });
  store.set("cards", {
    "in/ing:印": { char: "印", pair: "in/ing", state: 2, stability: 5, difficulty: 5, due: Date.now() - 1000, scheduledDays: 3, reps: 2, correctCount: 1, wrongCount: 1, firstTs: 1000, lastTs: Date.now() - 86400000, lastRating: 3 },
  });
  // 开：到期优先
  const on1 = buildQuestions("mix", null, 2, {});
  ok(on1.some((q) => q.fromFSRS), "开关开：含到期复习题");
  // 关：纯随机（旧逻辑），全部 fromFSRS=false
  store.setSettings({ enableFSRS: false });
  const off = buildQuestions("mix", null, 2, {});
  ok(off.every((q) => q.fromFSRS === false), "开关关：回到纯随机（全部 fromFSRS=false）");
  ok(off.every((q) => q.options.length >= 2 && q.options.some((o) => o.isCorrect)), "旧逻辑题目结构正常");
  // 再开：恢复到期优先
  store.setSettings({ enableFSRS: true });
  const on2 = buildQuestions("mix", null, 2, {});
  ok(on2.some((q) => q.fromFSRS), "重新开启：到期队列恢复生效");
}

console.log("== 6. 多行题/无限模式兼容 ==");
{
  store.clearAll();
  store.setSettings({ enableFSRS: true });
  // 无限模式分批出题不报错且不重复字
  const { startRound, currentQuestion, answer, answerRow, commitQuestion, next, isFinished } = await import("../src/lib/round.ts");
  const r = startRound("mix", null, "infinite", { source: "fsrs-test" });
  const seen = new Set<string>();
  let okRows = true;
  for (let i = 0; i < 20; i++) {
    const q = currentQuestion(r);
    if (!q) { okRows = false; break; }
    const key = q.char + "|" + (q.entry ? q.entry.reading : "");
    if (seen.has(key)) { okRows = false; break; }
    seen.add(key);
    if (q.rows) {
      for (let ri = 0; ri < q.rows.length; ri++) {
        answerRow(r, ri, q.rows[ri].options.find((o) => o.isCorrect)!);
      }
      commitQuestion(r);
    } else {
      answer(r, q.options.find((o) => o.isCorrect)!);
    }
    next(r);
  }
  ok(okRows && !isFinished(r), "无限模式 FSRS 出题 20 题正常、考点（字+读音）不重复");
  ok(store.getCards() && Object.keys(store.getCards()).length > 0, "作答后卡片状态累积");
}

console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
