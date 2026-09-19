/* 功能测试：已掌握常驻按钮（标记/撤回/多选/错题本联动）+ 上一题回溯
   运行：node scripts/test_features.js
   依赖：data/words.js + js/store.js + js/quiz.js + js/app.js（mock 浏览器环境） */
"use strict";
const { createAppEnv, evalModules } = require("./helpers/test-env.js");
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; console.error("  ✘", name); }
}

/* ---------- 环境（DOM 桩 + 元素注册表见 helpers/test-env.js） ----------
   timers=spy：记录被调度的回调但不执行——自动切题由测试手动驱动，
   且可断言"是否调度了自动前进"（回溯态不得调度） */
const { els, spyTimers, windowEvents } = createAppEnv({ timers: "spy" });
els.viewQuiz.classList.add("active");

evalModules([
  "js/store.js", "js/quiz.js", "js/ui.js",
  "js/view-home.js", "js/view-quiz.js", "js/view-result.js", "js/view-stats.js",
  "js/view-mastered.js", "js/view-wrongbook.js", "js/view-settings.js",
  "js/app.js",
]);
/* app.js/quiz.js 内部以裸标识符引用 Store/Quiz，需挂到 global 供 eval 作用域解析 */
global.Store = global.window.Store;
global.Quiz = global.window.Quiz;
global.App = global.window.App;
const Store = global.window.Store;
const Quiz = global.window.Quiz;
const App = global.window.App;


function clickOpt(q, ri, oi) {
  const btns = els.quizCard.querySelectorAll(".quiz-option");
  const btn = q.rows
    ? btns.find((b) => b.getAttribute("data-r") === String(ri) && b.getAttribute("data-i") === String(oi))
    : btns[oi];
  (btn.listeners.click || []).forEach((fn) => fn());
}
function maskOkBtn(mask) {
  let r = null;
  (function walk(n) { (n.children || []).forEach((c) => { if (!r && c.getAttribute && c.getAttribute("data-act") === "ok") r = c; walk(c); }); })(mask);
  return r;
}
function maskInputs(mask) {
  const out = [];
  (function walk(n) { (n.children || []).forEach((c) => { if (c.tagName === "input") out.push(c); walk(c); }); })(mask);
  return out;
}

/* ================= 测试用例 ================= */
console.log("== 功能测试：已掌握按钮 + 回溯 ==");

/* T1 单字题：常驻按钮 / 未作答标记跳过 / 揭示正确项 / 撤回复原 */
Store.clearAll();
const ding = {
  char: "盯", pairName: "in/ing",
  options: { correct: { py: "dīng", tag: "ing" }, wrong: { py: "dīn", tag: "in" } },
  words: [{ word: "盯住", pinyin: "dīng zhù" }],
};
const r = Quiz.startRound("mix", null, 4, { source: "feat" });
r.questions = [Quiz.makeQuestion(ding), Quiz.makeQuestion(ding), Quiz.makeQuestion(ding), Quiz.makeQuestion(ding)];
App.show("quiz");
const q0 = Quiz.currentQuestion();
ok(!q0.rows && els.btnMasteredTop.textContent === "已掌握", "T1 按钮常驻显示「已掌握」（单行题）");
App.toggleMastered();
ok(Store.isMastered(q0.char), "T1 未作答点已掌握 → 标记成功");
ok(els.btnMasteredTop.classList.contains("mastered") && els.btnMasteredTop.textContent.includes("✓"), "T1 按钮进入已掌握态 ✓");
ok(els.quizCard.querySelectorAll(".quiz-option").some((b) => b.classList.contains("ok")), "T1 揭示正确选项");
ok(els.quizCard.querySelectorAll(".quiz-option").every((b) => b.disabled), "T1 跳过本题（选项锁定）");
App.toggleMastered();
ok(!Store.isMastered(q0.char), "T1 再次点击 → 撤回成功");
ok(!els.btnMasteredTop.classList.contains("mastered"), "T1 撤回后按钮恢复描边态");

/* T2 作答后标记 + 错题本 hidden 联动 */
Quiz.next();
const q1 = Quiz.currentQuestion();
const wIdx = q1.options.findIndex((o) => !o.isCorrect);
clickOpt(q1, 0, wIdx);
ok(!!Store.getWrongBook()[q1.char] && !Store.getWrongBook()[q1.char].hidden, "T2 答错进错题本（可见）");
App.toggleMastered();
ok(Store.isMastered(q1.char), "T2 标记已掌握");
ok(!!Store.getWrongBook()[q1.char] && Store.getWrongBook()[q1.char].hidden, "T2 错题本条目置为失效（hidden 保留）");
App.toggleMastered();
ok(!Store.isMastered(q1.char), "T2 撤回已掌握");
ok(!!Store.getWrongBook()[q1.char] && !Store.getWrongBook()[q1.char].hidden, "T2 撤回后错题本恢复可见");
ok(!Store.getWrongBook()[q1.char].count < 1, "T2 错题次数未丢失");

/* T3 上一题回溯：已答状态 / 继续作答 */
App.prevQuestion();
ok(Quiz.getRound().index === 0, "T3 回溯到第 1 题");
ok(els.btnPrev.disabled, "T3 第 1 题时「上一题」禁用");
ok(els.btnResume.style.display !== "none", "T3 回溯时显示「继续作答」");
ok(!els.quizCard.querySelectorAll(".quiz-option").some((b) => b.disabled), "T3 未答题不锁定（可重新作答）");
App.resumeLatest();
ok(Quiz.getRound().index === 1, "T3 继续作答回到最新题");
ok(els.quizCard.querySelectorAll(".quiz-option").every((b) => b.disabled), "T3 已答题锁定");
ok(els.quizCard.querySelectorAll(".quiz-option").some((b) => b.classList.contains("bad")), "T3 答错选项标红");
ok(els.quizCard.querySelector(".quiz-feedback").textContent.includes("回答错误"), "T3 显示答错反馈");
ok(els.btnResume.style.display === "none", "T3 回到最新后隐藏「继续作答」");

/* T4 多字题已掌握多选 */
const niang = {
  char: "娘", pairName: "l/n",
  options: { correct: { py: "niáng", tag: "n" }, wrong: { py: "liáng", tag: "l" } },
  words: [{ word: "新娘", pinyin: "xīn niáng" }],
};
const r2 = Quiz.startRound("mix", null, 2, { source: "feat" });
r2.questions = [Quiz.makeQuestion(niang), Quiz.makeQuestion(niang)];
App.show("quiz");
const qm = Quiz.currentQuestion();
ok(!!qm.rows && qm.rows.length === 2, "T4 多字题 2 行");
App.toggleMastered();
const mask = document.body.children.find((c) => c.className === "popover-mask");
ok(!!mask, "T4 多字题点已掌握 → 弹出多选");
const cbs = mask ? maskInputs(mask) : [];
ok(cbs.length === 2, "T4 多选含 2 个考察字");
if (mask && cbs.length === 2) {
  cbs[0].checked = true;
  (mask.listeners.click || []).forEach((fn) => fn({ target: maskOkBtn(mask) }));
}
ok(Store.isMastered(qm.rows[0].char) && !Store.isMastered(qm.rows[1].char), "T4 仅勾选的字被标记");
ok(els.btnMasteredTop.textContent.includes("1/2"), "T4 按钮显示部分标记 1/2");

/* T5 无限模式回溯 */
const r3 = Quiz.startRound("mix", null, "infinite", { source: "feat" });
r3.questions = [Quiz.makeQuestion(ding), Quiz.makeQuestion(ding)];
Quiz.next();
App.prevQuestion();
ok(Quiz.getRound().index === 0, "T5 无限模式回溯到第 1 题");
App.resumeLatest();
ok(Quiz.getRound().index === 1, "T5 无限模式继续作答");

/* T6 错题本过滤：hidden 不参与重练与展示 */
Store.clearAll();
Store.addWrong({ char: "盯", pair: "in/ing", wrongPy: "dīn", correctPy: "dīng", word: "盯住" });
Store.addWrong({ char: "娘", pair: "l/n", wrongPy: "liáng", correctPy: "niáng", word: "新娘" });
Store.addMastered("盯", "in/ing"); // 盯 hidden
App.show("wrongbook");
const items = els.wrongbookBody ? els.wrongbookBody.textContent : "";
ok(!items.includes("盯住"), "T6 错题本列表隐藏已掌握失效条目");
ok(items.includes("新娘"), "T6 未失效条目正常显示");
const before = Object.keys(Store.getWrongBook()).length;
Store.removeMastered("盯");
ok(Store.getWrongBook()["盯"].hidden === false, "T6 撤回后错题记录恢复");

/* T7 回溯态标记已掌握：不自动前进（自动前进调度只发生在最新题位） */
Store.clearAll();
const la = {
  char: "辣", pairName: "l/n",
  options: { correct: { py: "là", tag: "l" }, wrong: { py: "nà", tag: "n" } },
  words: [{ word: "辣椒", pinyin: "là jiāo" }],
};
const r4 = Quiz.startRound("mix", null, 3, { source: "feat" });
r4.questions = [Quiz.makeQuestion(ding), Quiz.makeQuestion(la), Quiz.makeQuestion(ding)];
App.show("quiz");
// 答错第 1 题 → 前进到第 2 题 → 回溯到第 1 题
const qa = Quiz.currentQuestion();
clickOpt(qa, 0, qa.options.findIndex((o) => !o.isCorrect));
App.nextQuestion();
ok(Quiz.getRound().index === 1, "T7 答错后前进到第 2 题");
App.prevQuestion();
ok(Quiz.getRound().index === 0, "T7 回溯到第 1 题");
const schedBefore = spyTimers.filter(Boolean).length;
App.toggleMastered(); // 回溯态标记已掌握
ok(Store.isMastered(qa.char), "T7 回溯态标记成功");
ok(Quiz.getRound().index === 0, "T7 回溯态标记后不自动前进");
ok(spyTimers.filter(Boolean).length === schedBefore, "T7 回溯态未调度自动切题");
// 回到最新题位再标记 → 恢复「1 秒后自动下一题」调度
App.resumeLatest();
ok(Quiz.getRound().index === 1, "T7 继续作答回到最新题");
App.toggleMastered();
ok(Store.isMastered("辣"), "T7 最新题位标记成功");
ok(spyTimers.filter(Boolean).length === schedBefore + 1, "T7 最新题位标记后调度自动前进");

/* T8 键盘监听常驻：切换视图不再移除 keydown 监听
   （原实现离开答题页时 removeEventListener，且从不重新绑定 → 快捷键永久失效） */
App.show("home");
App.show("quiz");
App.show("stats");
App.show("home");
const removedKey = windowEvents.filter((e) => e.op === "remove" && e.type === "keydown");
ok(removedKey.length === 0, "视图切换不移除 keydown 监听（handler 内部自守卫视图激活）");

/* T9 统计页薄弱字 TOP 排行（cards 聚合，按累计错误次数排序） */
Store.clearAll();
Store.recordAnswer({ char: "乙", pair: "in/ing", rating: 1, word: "乙词", correctPy: "yǐ", mode: "mix", source: "t" });
Store.recordAnswer({ char: "丙", pair: "l/n", rating: 3, word: "丙词", correctPy: "bǐng", mode: "mix", source: "t" });
Store.recordAnswer({ char: "甲", pair: "l/n", rating: 1, word: "甲词", correctPy: "jiǎ", mode: "mix", source: "t" });
Store.recordAnswer({ char: "甲", pair: "l/n", rating: 1, word: "甲词", correctPy: "jiǎ", mode: "mix", source: "t" });
App.show("stats");
const weakHtml = els.statsWeak.textContent;
ok(weakHtml.indexOf("薄弱字") >= 0, "T9 统计页出现薄弱字区块");
ok(weakHtml.indexOf("甲") >= 0 && weakHtml.indexOf("甲") < weakHtml.indexOf("乙"), "T9 错 2 次的甲排在错 1 次的乙之前");
ok(weakHtml.indexOf("丙") < 0, "T9 只对不错的丙不进榜单");
ok(weakHtml.indexOf("重练") >= 0 && els.statsWeak.innerHTML.indexOf("practiceOne") >= 0, "T9 每行带单字重练入口（practiceOne）");
Store.clearAll();
App.show("stats");
ok(els.statsWeak.textContent.indexOf("暂无薄弱字") >= 0, "T9 无错题时显示空状态");

/* T10 渲染分支覆盖：首页最近练习表（有时间数据）/ 已掌握页数据态与空态
   （拆分模块后解构遗漏只在特定分支触发——空态与非空态都要渲染一遍） */
Store.clearAll();
Store.addHistory({ mode: "mix", pair: null, total: 10, correct: 8, durationSec: 60 });
Store.addMastered("盯", "in/ing");
App.show("home");
ok(els.homeRecent.textContent.indexOf("今天") >= 0, "T10 首页最近练习表渲染（时间格式化分支）");
App.show("mastered");
ok(els.masteredBody.textContent.indexOf("盯") >= 0 && els.masteredBody.innerHTML.indexOf("empty-hint") < 0, "T10 已掌握页数据态渲染");
Store.removeMastered("盯");
App.show("mastered");
ok(els.masteredBody.innerHTML.indexOf("empty-hint") >= 0, "T10 已掌握页空态渲染");

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
