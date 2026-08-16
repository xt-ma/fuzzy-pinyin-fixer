/* 功能测试：已掌握常驻按钮（标记/撤回/多选/错题本联动）+ 上一题回溯
   运行：node scripts/test_features.js
   依赖：data/words.js + js/store.js + js/quiz.js + js/app.js（mock 浏览器环境） */
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; console.error("  ✘", name); }
}

/* ---------- 极简 DOM stub ---------- */
class El {
  constructor(tag, id) {
    this.tagName = tag; this.id = id || ""; this.className = "";
    this.attrs = {}; this.children = []; this._text = "";
    this.style = {}; this.listeners = {}; this.disabled = false;
    this.parent = null;
    this.classList = {
      _s: new Set(),
      add: (c) => this.classList._s.add(c),
      remove: (c) => this.classList._s.delete(c),
      toggle: (c, on) => { on ? this.classList._s.add(c) : this.classList._s.delete(c); },
      contains: (c) => this.classList._s.has(c),
    };
  }
  get parentElement() { return this.parent; }
  set innerHTML(html) { this._html = html; this.children = parseHtml(html).children; }
  get innerHTML() { return this._html || ""; }
  set textContent(t) { this._text = String(t); this.children = []; }
  get textContent() {
    if (this._text) return this._text;
    return this.children.map((c) => (c.tagName === "#text" ? c.text : c.textContent || "")).join("");
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] || null; }
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  focus() {}
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); } }
  appendChild(c) { c.parent = this; this.children.push(c); }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return queryAll(this, sel); }
}
function parseHtml(html) {
  const root = { children: [] };
  const stack = [root];
  const re = /<(\/)?([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*(\/)?>/g;
  let last = 0, m;
  while ((m = re.exec(html))) {
    if (m.index > last) {
      const txt = html.slice(last, m.index).replace(/<[^>]*>/g, "");
      if (txt.trim()) stack[stack.length - 1].children.push({ tagName: "#text", text: txt });
    }
    last = re.lastIndex;
    if (m[1] === "/") { stack.pop(); continue; }
    const el = new El(m[2]);
    const attrRe = /([a-zA-Z-]+)(?:="([^"]*)")?/g;
    let am;
    while ((am = attrRe.exec(m[3]))) {
      if (am[1] === "class") el.className = am[2] || "";
      else if (am[1] === "id") el.id = am[2] || "";
      else el.attrs[am[1]] = am[2] || "";
    }
    stack[stack.length - 1].children.push(el);
    el.parent = stack[stack.length - 1];
    if (m[4] !== "/") stack.push(el);
  }
  return root;
}
function dfs(node, pred, out) {
  out = out || [];
  (node.children || []).forEach((c) => {
    if (c.tagName === "#text") return;
    if (pred(c)) out.push(c);
    dfs(c, pred, out);
  });
  return out;
}
function queryAll(node, sel) {
  const byId = sel.match(/^#([\w-]+)$/);
  if (byId) return dfs(node, (c) => c.id === byId[1]);
  const byClass = sel.match(/^\.([\w-]+)$/);
  if (byClass) return dfs(node, (c) => c.className.split(/\s+/).includes(byClass[1]));
  const byTagAttr = sel.match(/^([\w-]+)\[([\w-]+)="([^"]*)"\]$/);
  if (byTagAttr) return dfs(node, (c) => c.tagName === byTagAttr[1] && c.attrs[byTagAttr[2]] === byTagAttr[3]);
  const parts = sel.trim().split(/\s+/);
  if (parts.length === 2) {
    const root = parts[0].startsWith("#")
      ? (dfs(node, (c) => c.id === parts[0].slice(1))[0] || node)
      : node;
    const cls = parts[1].replace(/^\./, "");
    return dfs(root, (c) => c.className.split(/\s+/).includes(cls));
  }
  return [];
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
const els = {};
function makeEl(tag, id) { const e = new El(tag, id); if (id) els[id] = e; return e; }
["toast","homePairCards","homeStats","homeActions","homeRecent","quizModeLabel","quizProgressText","quizProgressBar","quizPairTag","quizCard","quizKeyHint","btnQuitQuiz","btnPrev","btnResume","btnMasteredTop","resultBody","masteredSearch","wrongbookAction","wrongbookBody"].forEach((id) => makeEl("div", id));
els.viewHome = makeEl("div", "view-home"); els.viewQuiz = makeEl("div", "view-quiz"); els.viewResult = makeEl("div", "view-result");
els.viewStats = makeEl("div", "view-stats"); els.viewMastered = makeEl("div", "view-mastered"); els.viewWrongbook = makeEl("div", "view-wrongbook");
els.viewQuiz.classList.add("active");

global.document = {
  body: makeEl("body"),
  createElement: (tag) => new El(tag),
  querySelector: (sel) => {
    const m = sel.match(/^#([\w-]+)\s+\.([\w-]+)$/);
    if (m) { const root = els[m[1]]; return root ? queryAll(root, "." + m[2])[0] || null : null; }
    const id = sel.replace(/^#/, "");
    if (els[id]) return els[id];
    return els.quizCard ? dfs(els.quizCard, (c) => c.id === id)[0] || null : null;
  },
  querySelectorAll: (sel) => {
    if (sel === ".view") return [els.viewHome, els.viewQuiz, els.viewResult, els.viewStats, els.viewMastered, els.viewWrongbook];
    if (sel === "#topNav a, #sider .menu-item") return [];
    if (sel === "#statsRange span") return [];
    if (sel === "#countSeg span") return [];
    if (sel === "#quizCard .quiz-option") return els.quizCard ? queryAll(els.quizCard, ".quiz-option") : [];
    if (sel === "#mFilter .ant-tag") return [];
    return [];
  },
  addEventListener: () => {},
};
global.window.addEventListener = () => {};
global.window.scrollTo = () => {};
global.window.removeEventListener = () => {};
global.setTimeout = () => 1; // 不自动执行（1 秒自动下一题由测试手动验证）
global.clearTimeout = () => {};
global.URLSearchParams = class { constructor() {} get() { return null; } };

eval(fs.readFileSync(path.join(ROOT, "js", "store.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "js", "quiz.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8"));
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

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
