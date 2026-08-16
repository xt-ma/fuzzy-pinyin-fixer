"use strict";
/* ============================================================
   同步设置区 UI 交互测试
   覆盖：未绑定态 / 非法密钥拒绝 / 合法绑定 / 本地数据污染警告 /
   生成新密钥（含警告）/ 清除本地数据双重确认 / 输入框不回填 / 自动开关
   ============================================================ */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ FAIL: " + n); } }

/* ---------- DOM stub ---------- */
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
/* 查找 body 下最后弹出的 popconfirm mask */
function lastMask() { const masks = dfs(document.body, (c) => c.className.split(/\s+/).includes("popover-mask")); return masks.length ? masks[masks.length - 1] : null; }
function clickMaskOk() { const mask = lastMask(); if (!mask) return null; const ok = dfs(mask, (c) => c.getAttribute && c.getAttribute("data-act") === "ok")[0]; if (!ok) return null; (mask.listeners.click || []).forEach((fn) => fn({ target: ok })); return mask; }
function maskText() { const mask = lastMask(); return mask ? mask.textContent : ""; }

/* ---------- 环境 ---------- */
global.localStorage = (() => { const s = {}; return { getItem: (k) => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: (k) => { delete s[k]; } }; })();
const src = fs.readFileSync(path.join(ROOT, "data", "words.js"), "utf8");
const json = src.replace(/^\/\/[^\n]*\n/, "").replace(/^window\.WORDS_DATA\s*=\s*/, "").replace(/;?\s*$/, "");
global.window = { WORDS_DATA: JSON.parse(json) };
const els = {};
function makeEl(tag, id) { const e = new El(tag, id); if (id) els[id] = e; return e; }
["toast","homePairCards","homeStats","homeActions","homeRecent","quizModeLabel","quizProgressText","quizProgressBar","quizPairTag","quizCard","quizKeyHint","btnQuitQuiz","btnPrev","btnResume","btnMasteredTop","resultBody","masteredSearch","wrongbookAction","wrongbookBody","settingsStats","fsrsStatus","syncHint","syncStatus","localKeyBox","statsCards","statsRange","statsCharts"].forEach((id) => makeEl("div", id));
els.syncServer = makeEl("input", "syncServer"); els.remoteKeyInput = makeEl("input", "remoteKeyInput");
els.syncAutoToggle = makeEl("input", "syncAutoToggle"); els.fsrsToggle = makeEl("input", "fsrsToggle");
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
global.window.addEventListener = () => {}; global.window.scrollTo = () => {}; global.window.removeEventListener = () => {};
global.setTimeout = (fn) => { fn(); return 1; }; global.clearTimeout = () => {};
global.location = { search: "" };
global.URLSearchParams = class { constructor() {} get() { return null; } };
global.URL = { createObjectURL: () => "blob:m", revokeObjectURL: () => {} };
/* fetch mock：GET 空空间 + PUT 成功 + DELETE 成功 */
let fetchCalls = [];
global.fetch = async (url, opts) => {
  opts = opts || {};
  fetchCalls.push({ url, method: opts.method || "GET", key: (opts.headers || {})["X-Sync-Key"] });
  if ((opts.method || "GET") === "GET") return { ok: true, status: 200, json: async () => ({ ok: true, data: null, updatedAt: Date.now() }) };
  if (opts.method === "PUT") return { ok: true, status: 200, json: async () => ({ ok: true, updatedAt: Date.now() }) };
  if (opts.method === "DELETE") return { ok: true, status: 200, json: async () => ({ ok: true }) };
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

eval(fs.readFileSync(path.join(ROOT, "js", "fsrs.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "js", "store.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "js", "quiz.js"), "utf8"));
global.Store = global.window.Store; global.FSRS = global.window.FSRS; global.Quiz = global.window.Quiz;
eval(fs.readFileSync(path.join(ROOT, "js", "sync.js"), "utf8"));
global.Sync = global.window.Sync;
eval(fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8"));
const Store = global.window.Store, App = global.window.App;
if (domReadyFn) domReadyFn();

const GOOD_KEY = "fpf-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijkl";
function fire(el, ev, extra) { (el.listeners[ev] || []).forEach((fn) => fn(Object.assign({ target: el }, extra || {}))); }
/* 冲刷微任务队列（等待 async handler 中的 fetch 链完成） */
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

(async () => {
  /* ======== T1 初始未绑定态 ======== */
  Store.clearAll();
  App.show("settings");
  ok(els.localKeyBox.textContent === "（未绑定）", "T1 未绑定时本机密钥显示（未绑定）");
  ok(els.btnCopyKey.style.display === "none" && els.btnResetKey.style.display === "none", "T1 无密钥时复制/重置按钮隐藏");
  ok(els.remoteKeyInput.style.display !== "none", "T1 远端密钥输入框可见（用户输入区）");
  console.log("== 1. 未绑定初始态 ==");

  /* ======== T2 非法密钥拒绝 ======== */
  els.remoteKeyInput.value = "123";
  fire(els.btnBindSync, "click");
  ok(!Store.getSettings().syncKey, "T2 非法密钥不写入 syncKey");
  ok(els.toast.textContent.includes("格式"), "T2 toast 提示格式错误");
  console.log("== 2. 非法密钥拒绝 ==");

  /* ======== T3 合法密钥绑定（本地无数据，直接绑定） ======== */
  els.syncServer.value = "https://m.workers.dev";
  fire(els.syncServer, "change");
  els.remoteKeyInput.value = GOOD_KEY;
  fire(els.btnBindSync, "click");
  await flush();
  ok(Store.getSettings().syncKey === GOOD_KEY, "T3 合法密钥写入 syncKey");
  ok(els.remoteKeyInput.value === "", "T3 绑定成功后输入框清空");
  ok(els.localKeyBox.textContent === GOOD_KEY, "T3 本机密钥只读区显示绑定密钥");
  ok(els.btnCopyKey.style.display !== "none", "T3 绑定后复制按钮出现");
  ok(fetchCalls.some((c) => c.method === "GET"), "T3 绑定触发立即同步（GET 拉取）");
  console.log("== 3. 合法密钥绑定 ==");

  /* ======== T4 本地有数据时绑定 → 污染警告 ======== */
  Store.clearAll();
  els.syncServer.value = "https://m.workers.dev";
  fire(els.syncServer, "change");
  Store.recordAnswer({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn", mode: "mix", source: "t" });
  els.remoteKeyInput.value = GOOD_KEY;
  fire(els.btnBindSync, "click");
  const m4 = lastMask();
  ok(!!m4, "T4 本地有数据时绑定弹出确认");
  ok(maskText().includes("双向合并") && maskText().includes("清除本地数据"), "T4 警告文案含双向合并与清除提示");
  clickMaskOk();
  await flush();
  ok(Store.getSettings().syncKey === GOOD_KEY, "T4 确认后完成绑定");
  console.log("== 4. 本地数据污染警告 ==");

  /* ======== T5 生成新密钥 ======== */
  Store.clearAll();
  els.syncServer.value = "https://m.workers.dev";
  fire(els.syncServer, "change");
  fire(els.btnGenKey, "click");
  ok(!!lastMask(), "T5 生成前弹确认");
  clickMaskOk();
  const k5 = Store.getSettings().syncKey;
  ok(Sync.isValidKey(k5), "T5 生成合法密钥: " + (k5 || "").slice(0, 8) + "...");
  ok(els.localKeyBox.textContent === k5, "T5 生成后只读区显示（不进输入框）");
  ok(els.remoteKeyInput.value === "", "T5 输入框保持为空（生成结果不入输入框）");
  console.log("== 5. 生成新密钥 ==");

  /* ======== T6 本地有数据时生成 → 警告 ======== */
  Store.clearAll();
  Store.recordAnswer({ char: "宁", pair: "in/ing", rating: 1, word: "宁静", correctPy: "níng", wrongPy: "nín", mode: "mix", source: "t" });
  fire(els.btnGenKey, "click");
  ok(maskText().includes("不属于你") && maskText().includes("清除本地数据"), "T6 生成警告提示他人数据风险");
  clickMaskOk();
  ok(Store.getSettings().syncKey && Sync.isValidKey(Store.getSettings().syncKey), "T6 确认后生成");
  console.log("== 6. 生成警告 ==");

  /* ======== T7 清除本地数据（双重确认） ======== */
  Store.setSettings({ enableSync: true, syncServer: "https://m.workers.dev", syncKey: GOOD_KEY });
  localStorage.setItem("fpf_syncMeta", JSON.stringify({ clientId: "x", lastSyncAt: 1 }));
  fire(els.btnClearData, "click");
  ok(!!lastMask() && maskText().includes("不可恢复"), "T7 第一次确认弹窗（不可恢复警告）");
  clickMaskOk();
  ok(!!lastMask() && maskText().includes("无法撤销"), "T7 第二次确认弹窗");
  clickMaskOk();
  ok(Store.getReviews().length === 0 && Object.keys(Store.getCards()).length === 0, "T7 清除后练习数据为空");
  ok(!Store.getSettings().syncKey && !Store.getSettings().syncServer, "T7 清除后同步配置为空");
  ok(localStorage.getItem("fpf_syncMeta") === null, "T7 同步元数据已清除");
  ok(els.localKeyBox.textContent === "（未绑定）", "T7 界面回到未绑定态");
  console.log("== 7. 清除本地数据 ==");

  /* ======== T8 输入框不回填 ======== */
  els.remoteKeyInput.value = "fpf-用户正在输入的内容";
  App.show("stats"); App.show("settings");
  ok(els.remoteKeyInput.value === "fpf-用户正在输入的内容", "T8 渲染后输入框保持用户输入（不回填）");
  console.log("== 8. 输入框不回填 ==");

  /* ======== T9 自动开关 ======== */
  els.syncAutoToggle.checked = false;
  fire(els.syncAutoToggle, "change");
  ok(Store.getSettings().enableSync === false, "T9 关闭开关写入 enableSync=false");
  els.syncAutoToggle.checked = true;
  fire(els.syncAutoToggle, "change");
  ok(Store.getSettings().enableSync === true, "T9 打开开关写入 enableSync=true");
  console.log("== 9. 自动开关 ==");

  console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})();
