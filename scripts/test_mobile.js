"use strict";
/* ============================================================
   移动端适配测试（L1+L2 文案切换）
   L1 纯 CSS 无 DOM 断言能力，由 DevTools 设备模拟手动验证
   L2 quizKeyHint 按 pointer:coarse 切换文案，DOM 可断言
   ============================================================ */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ FAIL: " + n); } }

/* ---------- DOM stub（复用 test_sync_ui 设施）---------- */
class El {
  constructor(tag, id) { this.tagName = tag; this.id = id || ""; this.className = ""; this.attrs = {}; this.children = []; this._text = ""; this.style = {}; this.listeners = {}; this.disabled = false; this.parent = null; this.checked = false; this.value = "";
    this.classList = { _s: new Set(), add: (c) => this.classList._s.add(c), remove: (c) => this.classList._s.delete(c), toggle: (c, on) => { on ? this.classList._s.add(c) : this.classList._s.delete(c); }, contains: (c) => this.classList._s.has(c) }; }
  get parentElement() { return this.parent; }
  set innerHTML(html) { this._html = html; this.children = parseHtml(html).children; }
  get innerHTML() { return this._html || ""; }
  set textContent(t) { this._text = String(t); this.children = []; }
  get textContent() { return this._text ? this._text : this.children.map((c) => (c.tagName === "#text" ? c.text : c.textContent || "")).join(""); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] || null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  focus() {} click() {}
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); } }
  appendChild(c) { c.parent = this; this.children.push(c); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return queryAll(this, sel); }
}
function parseHtml(html) { const root = { children: [] }; const stack = [root]; const re = /<(\/)?([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*(\/)?>/g; let last = 0, m; while ((m = re.exec(html))) { if (m.index > last) { const txt = html.slice(last, m.index).replace(/<[^>]*>/g, ""); if (txt.trim()) stack[stack.length - 1].children.push({ tagName: "#text", text: txt }); } last = re.lastIndex; if (m[1] === "/") { stack.pop(); continue; } const el = new El(m[2]); const attrRe = /([a-zA-Z-]+)(?:="([^"]*)")?/g; let am; while ((am = attrRe.exec(m[3]))) { if (am[1] === "class") el.className = am[2] || ""; else if (am[1] === "id") el.id = am[2] || ""; else el.attrs[am[1]] = am[2] || ""; } stack[stack.length - 1].children.push(el); el.parent = stack[stack.length - 1]; if (m[4] !== "/") stack.push(el); } return root; }
function dfs(node, pred, out) { out = out || []; (node.children || []).forEach((c) => { if (c.tagName === "#text") return; if (pred(c)) out.push(c); dfs(c, pred, out); }); return out; }
function queryAll(node, sel) { const byId = sel.match(/^#([\w-]+)$/); if (byId) return dfs(node, (c) => c.id === byId[1]); const byClass = sel.match(/^\.([\w-]+)$/); if (byClass) return dfs(node, (c) => c.className.split(/\s+/).includes(byClass[1])); const parts = sel.trim().split(/\s+/); if (parts.length === 2) { const root = parts[0].startsWith("#") ? (dfs(node, (c) => c.id === parts[0].slice(1))[0] || node) : node; const cls = parts[1].replace(/^\./, ""); return dfs(root, (c) => c.className.split(/\s+/).includes(cls)); } return []; }

global.localStorage = (() => { const s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } }; })();
const src = fs.readFileSync(path.join(ROOT, "data", "words.js"), "utf8");
const json = src.replace(/^\/\/[^\n]*\n/, "").replace(/^window\.WORDS_DATA\s*=\s*/, "").replace(/;?\s*$/, "");
const els = {};
function makeEl(tag, id) { const e = new El(tag, id); if (id) els[id] = e; return e; }
["toast","homePairCards","homeStats","homeActions","homeRecent","quizModeLabel","quizProgressText","quizProgressBar","quizPairTag","quizProgress","quizCard","quizKeyHint","btnQuitQuiz","btnPrev","btnResume","btnMasteredTop","btnTtsToggle","resultBody","masteredSearch","masteredBody","wrongbookAction","wrongbookBody","settingsStats","fsrsStatus","ttsDesc","syncHint","syncStatus","localKeyBox","statsCards","statsRange","statsCharts","statsWeak"].forEach((id) => makeEl("div", id));
els.syncServer = makeEl("input", "syncServer"); els.remoteKeyInput = makeEl("input", "remoteKeyInput");
els.syncAutoToggle = makeEl("input", "syncAutoToggle"); els.fsrsToggle = makeEl("input", "fsrsToggle");
els.ttsToggle = makeEl("input", "ttsToggle");
els.importFileInput = makeEl("input", "importFileInput");
els.btnBindSync = makeEl("button", "btnBindSync"); els.btnManualSync = makeEl("button", "btnManualSync");
els.btnGenKey = makeEl("button", "btnGenKey"); els.btnCopyKey = makeEl("button", "btnCopyKey"); els.btnResetKey = makeEl("button", "btnResetKey"); els.btnClearData = makeEl("button", "btnClearData");
els.viewHome = makeEl("div", "view-home"); els.viewQuiz = makeEl("div", "view-quiz"); els.viewResult = makeEl("div", "view-result");
els.viewStats = makeEl("div", "view-stats"); els.viewMastered = makeEl("div", "view-mastered"); els.viewWrongbook = makeEl("div", "view-wrongbook"); els.viewSettings = makeEl("div", "view-settings");
els.viewQuiz.classList.add("active");
let domReadyFn = null;
global.document = {
  body: makeEl("body"), createElement: (t) => new El(t), activeElement: null,
  querySelector: (sel) => { const m = sel.match(/^#([\w-]+)\s+\.([\w-]+)$/); if (m) { const r = els[m[1]]; return r ? queryAll(r, "." + m[2])[0] || null : null; } const id = sel.replace(/^#/, ""); if (els[id]) return els[id]; return els.quizCard ? dfs(els.quizCard, (c) => c.id === id)[0] || null : null; },
  querySelectorAll: (sel) => { if (sel === ".view") return [els.viewHome, els.viewQuiz, els.viewResult, els.viewStats, els.viewMastered, els.viewWrongbook, els.viewSettings]; if (sel === "#topNav a, #sider .menu-item" || sel === "#statsRange span" || sel === "#countSeg span" || sel === "#mFilter .ant-tag") return []; if (sel === "#quizCard .quiz-option") return els.quizCard ? queryAll(els.quizCard, ".quiz-option") : []; return []; },
  addEventListener: (ev, fn) => { if (ev === "DOMContentLoaded") domReadyFn = fn; },
};
let pointerCoarse = true;
global.window = {
  WORDS_DATA: JSON.parse(json),
  matchMedia: (q) => ({ matches: pointerCoarse && q.indexOf("coarse") >= 0, addEventListener: () => {}, removeEventListener: () => {} }),
  addEventListener: () => {}, scrollTo: () => {}, removeEventListener: () => {},
};
global.setTimeout = () => 1; global.clearTimeout = () => {};
global.location = { search: "" };
global.URLSearchParams = class { constructor() {} get() { return null; } };
global.URL = { createObjectURL: () => "blob:m", revokeObjectURL: () => {} };
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: null, updatedAt: Date.now() }) });

eval(fs.readFileSync(path.join(ROOT, "js", "store.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "js", "quiz.js"), "utf8"));
global.Quiz = global.window.Quiz; global.Store = global.window.Store; global.FSRS = global.window.FSRS;
eval(fs.readFileSync(path.join(ROOT, "js", "sync.js"), "utf8"));
global.Sync = global.window.Sync;
eval(fs.readFileSync(path.join(ROOT, "js", "ui.js"), "utf8"));
["view-home", "view-quiz", "view-result", "view-stats", "view-mastered", "view-wrongbook", "view-settings"].forEach((v) => {
  eval(fs.readFileSync(path.join(ROOT, "js", v + ".js"), "utf8"));
});
eval(fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8"));
const App = global.window.App;
if (domReadyFn) domReadyFn();

/* ===== T1 触屏（pointer:coarse=true）：答题提示无键盘字样 ===== */
pointerCoarse = true;
Quiz.startRound("mix", null, 5, { source: "t" });
App.show("quiz");
const hintTouch = els.quizKeyHint.textContent;
console.log("== 1. 触屏设备答题提示 ==");
ok(hintTouch.indexOf("点击选项") >= 0 || hintTouch.indexOf("逐行点击") >= 0, "触屏提示含「点击」相关文案");
ok(hintTouch.indexOf("键盘") < 0 && hintTouch.indexOf("数字键") < 0, "触屏提示不出现「键盘/数字键」");
console.log("  > " + hintTouch);

/* ===== T2 桌面（pointer:coarse=false）：提示应含键盘/数字键 ===== */
pointerCoarse = false;
App.show("quiz");
const hintDesktop = els.quizKeyHint.textContent;
console.log("== 2. 桌面设备答题提示 ==");
ok(hintDesktop.indexOf("键盘") >= 0 || hintDesktop.indexOf("数字键") >= 0, "桌面提示含「键盘」或「数字键」（兼容单行/多行分支）");
ok(hintDesktop.indexOf("点击选项") < 0 && hintDesktop.indexOf("逐行点击") < 0, "桌面提示不出现触屏文案");
console.log("  > " + hintDesktop);

/* ===== T3 触屏 + 答一题 + 回溯后：提示应区分回溯状态 ===== */
pointerCoarse = true;
Quiz.answer(Quiz.currentQuestion().options.find((o) => o.isCorrect));
Quiz.next();
App.show("quiz");
const hintTouchBack = els.quizKeyHint.textContent;
console.log("== 3. 触屏 + 答一题后回溯提示 ==");
ok(hintTouchBack.indexOf("点击选项") >= 0 || hintTouchBack.indexOf("逐行点击") >= 0, "触屏提示含点击相关");
ok(hintTouchBack.indexOf("键盘") < 0 && hintTouchBack.indexOf("数字键") < 0, "触屏提示不含桌面键盘提示");
console.log("  > " + hintTouchBack);

/* ===== T4 桌面 + 答一题后回溯：回溯提示含桌面键盘文案 ===== */
pointerCoarse = false;
App.show("quiz");
const hintDesktopBack = els.quizKeyHint.textContent;
console.log("== 4. 桌面回溯提示 ==");
ok(hintDesktopBack.indexOf("键盘") >= 0 || hintDesktopBack.indexOf("数字键") >= 0 || hintDesktopBack.indexOf("逐行选择") >= 0, "桌面提示含桌面键盘文案分支");
ok(hintDesktopBack.indexOf("点击选项") < 0 && hintDesktopBack.indexOf("逐行点击") < 0, "桌面提示不出现触屏文案");
console.log("  > " + hintDesktopBack);

/* ===== T4 PWA 文件存在性 ===== */
console.log("== 4. PWA 文件存在 ==");
ok(fs.existsSync(path.join(ROOT, "manifest.json")), "manifest.json 存在");
ok(fs.existsSync(path.join(ROOT, "sw.js")), "sw.js 存在");
ok(fs.existsSync(path.join(ROOT, "icons", "icon-192.png")), "icons/icon-192.png 存在");
ok(fs.existsSync(path.join(ROOT, "icons", "icon-512.png")), "icons/icon-512.png 存在");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
// 故意只含 192 图标：使站点不满足 Chrome 可安装条件（需 192+512），
// 避免 Android Chrome 触发 WebAPK 云端打包（国内网络连不上 Google 导致安装失败），
// 退回本地快捷方式路径，仍按 manifest 以 standalone 窗口打开
ok(manifest.icons && manifest.icons.length === 1, "manifest 仅含 1 个图标（故意禁用 Chrome 安装，见注释）");
ok(manifest.start_url === "./" && manifest.display === "standalone", "manifest 启动/显示模式正确（start_url 用根路径：Pages 会 308 重定向 /index.html，重定向响应进缓存会致 ERR_FAILED）");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
ok(html.indexOf("viewport-fit=cover") >= 0, "index.html 含 viewport-fit=cover");
ok(html.indexOf('rel="manifest"') >= 0, "index.html 引入 manifest");
ok(html.indexOf("serviceWorker.register") >= 0, "index.html 注册 SW");

/* ===== T5 无障碍静态检查（T12） ===== */
console.log("== 5. 无障碍静态检查 ==");
ok((html.match(/role="button"/g) || []).length === 10, "topNav + sider 共 10 个导航项均声明 role=button");
ok((html.match(/tabindex="0"/g) || []).length === 10, "10 个导航项均可 Tab 聚焦");
ok(html.indexOf('aria-label="切换作答朗读"') >= 0, "朗读开关带 aria-label");
ok(html.indexOf('role="progressbar"') >= 0 && html.indexOf('aria-valuenow') >= 0, "答题进度条声明 progressbar 语义");
const css = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");
ok(css.indexOf(":focus-visible") >= 0, "样式表含 :focus-visible 焦点样式");
ok(css.indexOf("prefers-reduced-motion") >= 0, "样式表尊重 prefers-reduced-motion");
ok(css.indexOf("@keyframes alertIn") >= 0, "反馈条含浮现动效（alertIn）");
const appSrc = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const quizViewSrc = fs.readFileSync(path.join(ROOT, "js", "view-quiz.js"), "utf8");
ok(quizViewSrc.indexOf('aria-pressed') >= 0, "朗读开关状态同步 aria-pressed");
ok(appSrc.indexOf("removeEventListener(\"keydown\"") < 0, "视图切换不移除 keydown 监听（离开答题页后快捷键不再失效）");
ok(html.indexOf('js/ui.js') >= 0 && html.indexOf('js/view-quiz.js') >= 0 && html.indexOf('js/view-settings.js') >= 0, "index.html 加载 ui 与视图模块");
const swSrc = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
ok(swSrc.indexOf('"./js/ui.js"') >= 0 && swSrc.indexOf('"./js/view-quiz.js"') >= 0 && swSrc.indexOf('"./js/view-settings.js"') >= 0, "SW 壳缓存包含 ui 与视图模块");

console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);