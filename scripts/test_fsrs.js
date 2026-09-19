/* ============================================================
   模糊音克星 · FSRS 记忆调度测试（scripts/test_fsrs.js）
   覆盖：公式性质 / review 状态机 / recordAnswer 集成 / 到期队列出题 / 回滚切换
   运行：node scripts/test_fsrs.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL: " + name); }
}

/* ---------- 环境 ---------- */
global.localStorage = (() => { const s = {}; return {
  getItem: (k) => (k in s ? s[k] : null),
  setItem: (k, v) => { s[k] = String(v); },
  removeItem: (k) => { delete s[k]; },
};})();
const src = fs.readFileSync(path.join(ROOT, "data", "words.js"), "utf8");
const json = src.replace(/^\/\/[^\n]*\n/, "").replace(/^window\.WORDS_DATA\s*=\s*/, "").replace(/;?\s*$/, "");
global.window = { WORDS_DATA: JSON.parse(json) };
eval(fs.readFileSync(path.join(ROOT, "js", "fsrs.js"), "utf8"));
const FSRS = global.window.FSRS;
eval(fs.readFileSync(path.join(ROOT, "js", "store.js"), "utf8"));
const Store = global.window.Store;
global.Store = Store;
global.FSRS = FSRS;
eval(fs.readFileSync(path.join(ROOT, "js", "quiz.js"), "utf8"));
const Quiz = global.window.Quiz;

// 固定 fuzz 与时间基准，保证确定性
FSRS.setFuzz(() => 0);
const NOW = 1700000000000;
const DAY = FSRS.DAY_MS;

console.log("== 1. FSRS 公式性质 ==");
(() => {
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
  ok(rH.scheduledDays <= rG.scheduledDays && rG.scheduledDays <= rE.scheduledDays,
    "间隔单调 hard(" + rH.scheduledDays + ")<=good(" + rG.scheduledDays + ")<=easy(" + rE.scheduledDays + ")");
})();

console.log("== 2. review 状态机 ==");
(() => {
  // 新卡首次 good → review，due 在未来
  const c1 = FSRS.review({ state: 0, stability: null, difficulty: null, due: null, lastTs: null }, 3, NOW);
  ok(c1.state === 2, "新卡首次答对 → state=2(review)");
  ok(c1.due > NOW && c1.scheduledDays >= 1, "due 在未来，scheduledDays>=1（" + c1.scheduledDays + " 天）");
  ok(c1.stability > 0 && c1.difficulty >= 1 && c1.difficulty <= 10, "stability/difficulty 有效");

  // 新卡首次 again → relearning
  const c2 = FSRS.review({ state: 0, stability: null, difficulty: null, due: null, lastTs: null }, 1, NOW);
  ok(c2.state === 3, "新卡首次答错 → state=3(relearning)");

  // review 卡连续答对：间隔递增
  const cardA = { state: 0, stability: null, difficulty: null, due: null, lastTs: null };
  const r1 = FSRS.review(cardA, 3, NOW);
  const cardB = { state: r1.state, stability: r1.stability, difficulty: r1.difficulty, due: r1.due, lastTs: NOW };
  const r2 = FSRS.review(cardB, 3, NOW + 5 * DAY);
  ok(r2.scheduledDays > r1.scheduledDays, "复习间隔递增（" + r1.scheduledDays + " → " + r2.scheduledDays + " 天）");
  ok(r2.state === 2, "复习答对保持 review");

  // review 卡答错：稳定性下降、间隔缩短、转 relearning
  const cardC = { state: 2, stability: r2.stability, difficulty: r2.difficulty, due: r2.due, lastTs: NOW + 5 * DAY };
  const r3 = FSRS.review(cardC, 1, NOW + 10 * DAY);
  ok(r3.state === 3, "复习答错 → state=3(relearning)");
  ok(r3.stability < r2.stability, "答错稳定性下降（" + r2.stability + " → " + r3.stability + "）");
  ok(r3.scheduledDays <= r2.scheduledDays, "答错间隔不增（" + r3.scheduledDays + " <= " + r2.scheduledDays + "）");
})();

console.log("== 3. recordAnswer 集成（FSRS 开/关） ==");
(() => {
  Store.clearAll();
  Store.setSettings({ enableFSRS: true });
  Store.recordAnswer({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn", mode: "mix", source: "test" });
  const card = Store.getCards()["in/ing:印"];
  ok(card && card.due != null && card.due > Date.now(), "FSRS 开启：作答后卡片写入 due");
  ok(card.state === 2 && card.stability > 0 && card.difficulty >= 1, "FSRS 开启：state/stability/difficulty 已更新");
  ok(Store.getDueKeys(Date.now(), 10).length === 0, "刚答完未到期 → 待复习队列为空");

  // 关闭 FSRS：作答后不写 due（回滚）
  Store.clearAll();
  Store.setSettings({ enableFSRS: false });
  Store.recordAnswer({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn", mode: "mix", source: "test" });
  const card2 = Store.getCards()["in/ing:印"];
  ok(card2 && card2.due == null && card2.state === 0, "FSRS 关闭：卡片保持初始状态（due=null）");
  ok(Store.getDueKeys(Date.now(), 10).length === 0, "FSRS 关闭：无到期队列");
  Store.setSettings({ enableFSRS: true });
})();

console.log("== 4. 到期队列出题 ==");
(() => {
  Store.clearAll();
  Store.setSettings({ enableFSRS: true });
  // 造一张到期卡（印，due 在过去）
  Store.set("cards", {
    "in/ing:印": { char: "印", pair: "in/ing", state: 2, stability: 5, difficulty: 5, due: Date.now() - 1000, scheduledDays: 3, reps: 2, correctCount: 1, wrongCount: 1, firstTs: 1000, lastTs: Date.now() - 86400000, lastRating: 3 },
  });
  const qs = Quiz.buildQuestions("mix", null, 3, {});
  const yin = qs.find((q) => q.char === "印");
  ok(!!yin, "到期字「印」进入出题池");
  ok(yin.fromFSRS === true, "到期字标记 fromFSRS=true");
  ok(qs.filter((q) => q.fromFSRS).length === 1, "仅 1 张到期卡被优先（其余为随机补充）");
  ok(qs.filter((q) => !q.fromFSRS).length === 2, "不足部分由随机补充（fromFSRS=false）");

  // count=1 时只出到期卡
  const qs1 = Quiz.buildQuestions("mix", null, 1, {});
  ok(qs1.length === 1 && qs1[0].char === "印" && qs1[0].fromFSRS, "count=1 时到期卡优先输出");

  // 到期卡的字已掌握 → 被过滤
  Store.addMastered("印", "in/ing");
  const qs2 = Quiz.buildQuestions("mix", null, 1, {});
  ok(!qs2.some((q) => q.char === "印"), "到期但已掌握的字不再出题");
  Store.removeMastered("印");
})();

console.log("== 5. 回滚切换（开/关/开） ==");
(() => {
  Store.clearAll();
  Store.setSettings({ enableFSRS: true });
  Store.set("cards", {
    "in/ing:印": { char: "印", pair: "in/ing", state: 2, stability: 5, difficulty: 5, due: Date.now() - 1000, scheduledDays: 3, reps: 2, correctCount: 1, wrongCount: 1, firstTs: 1000, lastTs: Date.now() - 86400000, lastRating: 3 },
  });
  // 开：到期优先
  const on1 = Quiz.buildQuestions("mix", null, 2, {});
  ok(on1.some((q) => q.fromFSRS), "开关开：含到期复习题");
  // 关：纯随机（旧逻辑），全部 fromFSRS=false
  Store.setSettings({ enableFSRS: false });
  const off = Quiz.buildQuestions("mix", null, 2, {});
  ok(off.every((q) => q.fromFSRS === false), "开关关：回到纯随机（全部 fromFSRS=false）");
  ok(off.every((q) => q.options.length >= 2 && q.options.some((o) => o.isCorrect)), "旧逻辑题目结构正常");
  // 再开：恢复到期优先
  Store.setSettings({ enableFSRS: true });
  const on2 = Quiz.buildQuestions("mix", null, 2, {});
  ok(on2.some((q) => q.fromFSRS), "重新开启：到期队列恢复生效");
})();

console.log("== 6. 多行题/无限模式兼容 ==");
(() => {
  Store.clearAll();
  Store.setSettings({ enableFSRS: true });
  // 无限模式分批出题不报错且不重复字
  const r = Quiz.startRound("mix", null, "infinite", { source: "fsrs-test" });
  const seen = new Set();
  let okRows = true;
  for (let i = 0; i < 20; i++) {
    const q = Quiz.currentQuestion();
    if (!q) { okRows = false; break; }
    const key = q.char + "|" + (q.entry ? q.entry.reading : "");
    if (seen.has(key)) { okRows = false; break; }
    seen.add(key);
    if (q.rows) {
      for (let ri = 0; ri < q.rows.length; ri++) {
        Quiz.answerRow(ri, q.rows[ri].options.find((o) => o.isCorrect));
      }
      Quiz.commitQuestion();
    } else {
      Quiz.answer(q.options.find((o) => o.isCorrect));
    }
    Quiz.next();
  }
  ok(okRows && !Quiz.isFinished(), "无限模式 FSRS 出题 20 题正常、考点（字+读音）不重复");
  ok(Store.getCards() && Object.keys(Store.getCards()).length > 0, "作答后卡片状态累积");
})();

console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
