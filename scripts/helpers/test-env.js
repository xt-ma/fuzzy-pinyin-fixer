/* ============================================================
   共享测试环境 helper（scripts/helpers/test-env.js）
   消除各测试文件重复手写的 localStorage / words.js 解析 / DOM 桩。
   适用于「global 注入 + eval 模块加载」型测试：
     test_features / test_sync_ui / test_sync_auto
   vm 沙箱型（test_logic / test_fsrs / test_tts）与
   静态检查型（test_mobile）不适用，维持各自环境。
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");

/* ---------- 内存 localStorage ---------- */
function memLocalStorage() {
  const s = {};
  return {
    getItem: (k) => (k in s ? s[k] : null),
    setItem: (k, v) => { s[k] = String(v); },
    removeItem: (k) => { delete s[k]; },
  };
}

/* ---------- data/words.js → 数据对象（file:// 加载格式，单行 JSON 赋值） ---------- */
function loadWordsData() {
  const src = fs.readFileSync(path.join(ROOT, "data", "words.js"), "utf8");
  const json = src
    .replace(/^\/\/[^\n]*\n/, "")
    .replace(/^window\.WORDS_DATA\s*=\s*/, "")
    .replace(/;?\s*$/, "");
  return JSON.parse(json);
}

/* ---------- 迷你 DOM 桩（覆盖 app.js 渲染层用到的 DOM 子集） ---------- */
class StubEl {
  constructor(tag, id) {
    this.tagName = tag; this.id = id || ""; this.className = "";
    this.attrs = {}; this.children = []; this._text = "";
    this.style = {}; this.listeners = {}; this.disabled = false;
    this.checked = false; this.value = "";
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
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  focus() {} click() {}
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); } }
  appendChild(c) { c.parent = this; this.children.push(c); }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
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
    const el = new StubEl(m[2]);
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

/* ---------- popconfirm 弹窗辅助（基于 document.body 下最后弹出的 mask） ---------- */
function lastMask() {
  const masks = dfs(document.body, (c) => c.className.split(/\s+/).includes("popover-mask"));
  return masks.length ? masks[masks.length - 1] : null;
}
function clickMaskOk(mask) {
  mask = mask || lastMask();
  if (!mask) return null;
  const okBtn = dfs(mask, (c) => c.getAttribute && c.getAttribute("data-act") === "ok")[0];
  if (!okBtn) return null;
  (mask.listeners.click || []).forEach((fn) => fn({ target: okBtn }));
  return mask;
}
function maskText() {
  const mask = lastMask();
  return mask ? mask.textContent : "";
}

/* ---------- 按顺序 eval 应用模块 ----------
   前置条件：调用方已注入 global.window / global.document / global.localStorage */
function evalModules(files) {
  for (const f of files) eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
}

/* ---------- 标准应用环境（渲染层测试用，覆盖 app.js 引用的全部元素 ID） ---------- */
const DEFAULT_DIV_IDS = [
  "toast", "homePairCards", "homeStats", "homeActions", "homeRecent",
  "quizModeLabel", "quizProgressText", "quizProgressBar", "quizPairTag", "quizProgress",
  "quizCard", "quizKeyHint", "btnQuitQuiz", "btnPrev", "btnResume", "btnMasteredTop",
  "resultBody", "masteredSearch", "wrongbookAction", "wrongbookBody",
  "settingsStats", "fsrsStatus", "syncHint", "syncStatus", "localKeyBox",
  "statsCards", "statsRange", "statsCharts", "ttsDesc",
];
const VIEW_IDS = [
  "view-home", "view-quiz", "view-result", "view-stats",
  "view-mastered", "view-wrongbook", "view-settings",
];

/* opts.timers:
   - "noop"（默认）：setTimeout 不执行——自动切题由测试手动驱动
   - "immediate"：setTimeout 同步立即执行（防抖/延迟全部即时完成）
   - "spy"：记录被调度的回调但不执行（断言"是否调用了自动前进"） */
function createAppEnv(opts) {
  opts = opts || {};
  global.localStorage = memLocalStorage();
  global.window = { WORDS_DATA: loadWordsData() };

  const els = {};
  function makeEl(tag, id) { const e = new StubEl(tag, id); if (id) els[id] = e; return e; }
  DEFAULT_DIV_IDS.forEach((id) => makeEl("div", id));
  ["syncServer", "remoteKeyInput", "syncAutoToggle", "fsrsToggle", "ttsToggle", "importFileInput"]
    .forEach((id) => makeEl("input", id));
  ["btnBindSync", "btnManualSync", "btnGenKey", "btnCopyKey", "btnResetKey", "btnClearData", "btnTtsToggle"]
    .forEach((id) => makeEl("button", id));
  const views = VIEW_IDS.map((id) => makeEl("div", id));
  /* 视图元素按 DOM id（view-quiz）注册，另挂驼峰别名（els.viewQuiz）便于测试访问 */
  VIEW_IDS.forEach((id, i) => {
    const camel = "view" + id.slice(5).replace(/^./, (c) => c.toUpperCase());
    els[camel] = views[i];
  });

  const domReadyFns = [];
  const spyTimers = [];
  const windowEvents = [];
  global.document = {
    body: makeEl("body"),
    createElement: (t) => new StubEl(t),
    activeElement: null,
    querySelector: (sel) => {
      const m = sel.match(/^#([\w-]+)\s+\.([\w-]+)$/);
      if (m) { const r = els[m[1]]; return r ? queryAll(r, "." + m[2])[0] || null : null; }
      const id = sel.replace(/^#/, "");
      if (els[id]) return els[id];
      return els.quizCard ? dfs(els.quizCard, (c) => c.id === id)[0] || null : null;
    },
    querySelectorAll: (sel) => {
      if (sel === ".view") return views;
      if (sel === "#topNav a, #sider .menu-item" || sel === "#statsRange span" ||
          sel === "#countSeg span" || sel === "#mFilter .ant-tag") return [];
      if (sel === "#quizCard .quiz-option") return els.quizCard ? queryAll(els.quizCard, ".quiz-option") : [];
      return [];
    },
    addEventListener: (ev, fn) => { if (ev === "DOMContentLoaded") domReadyFns.push(fn); },
  };
  global.window.addEventListener = (type, fn) => { windowEvents.push({ op: "add", type, fn }); };
  global.window.removeEventListener = (type, fn) => { windowEvents.push({ op: "remove", type, fn }); };
  global.window.scrollTo = () => {};
  global.location = { search: "" };
  global.URLSearchParams = class { constructor() {} get() { return null; } };
  global.URL = { createObjectURL: () => "blob:m", revokeObjectURL: () => {} };

  if (opts.timers === "immediate") {
    global.setTimeout = (fn) => { fn(); return 1; };
    global.clearTimeout = () => {};
  } else if (opts.timers === "spy") {
    global.setTimeout = (fn) => { spyTimers.push(fn); return spyTimers.length; };
    global.clearTimeout = (id) => { if (id && spyTimers[id - 1] !== null) spyTimers[id - 1] = null; };
  } else {
    global.setTimeout = () => 1;
    global.clearTimeout = () => {};
  }

  return {
    els,
    makeEl,
    spyTimers,
    windowEvents,
    fireDomReady: () => domReadyFns.forEach((fn) => fn()),
  };
}

/* ---------- 可控手动定时器（异步推送链路测试用） ---------- */
function createManualTimers() {
  let timers = [];
  return {
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: (id) => { if (id && timers[id - 1] !== null) timers[id - 1] = null; },
    pending: () => timers.filter(Boolean).length,
    takePending: () => { const t = timers.filter(Boolean); timers = []; return t; },
    reset: () => { timers = []; },
    /* 冲刷全部待执行定时器（含执行中新增的，如指数退避重试链） */
    run: async function () {
      let guard = 0;
      while (guard++ < 50) {
        const t = this.takePending();
        if (!t.length) break;
        for (const fn of t) await fn();
        for (let i = 0; i < 5; i++) await Promise.resolve();
      }
    },
  };
}

module.exports = {
  memLocalStorage,
  loadWordsData,
  StubEl,
  parseHtml,
  dfs,
  queryAll,
  lastMask,
  clickMaskOk,
  maskText,
  evalModules,
  createAppEnv,
  createManualTimers,
};
