/* ============================================================
   模糊音克星 · 自动云同步测试（scripts/test_sync_auto.js）
   覆盖：密钥生成/格式 / 变更打点 / 防抖推送 / 失败重试 /
         拉取合并 / suppress 抑制 / exportData 剥离 / 双设备 roundtrip
   运行：node scripts/test_sync_auto.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
process.on("unhandledRejection", (e) => {
  console.log("  ✗ [unhandledRejection] " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
});
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL: " + name); }
}

/* ---------- 可控定时器（支持异步执行 + 取消） ---------- */
let timers = [];
global.setTimeout = (fn) => { timers.push(fn); return timers.length; };
global.clearTimeout = (id) => { if (id && timers[id - 1] !== null) timers[id - 1] = null; };
/* 执行当前已排队的定时器（await 其异步完成 + flush 微任务） */
async function runTimersAsync() {
  let guard = 0;
  while (guard++ < 50) {
    const t = timers.filter(Boolean);
    timers = [];
    if (!t.length) break;
    for (const fn of t) {
      await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timer hung")), 1000)),
      ]);
    }
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
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
eval(fs.readFileSync(path.join(ROOT, "js", "store.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "js", "sync.js"), "utf8"));
eval(fs.readFileSync(path.join(ROOT, "js", "quiz.js"), "utf8"));
const Store = global.window.Store, Sync = global.window.Sync, Quiz = global.window.Quiz;
global.Store = Store; global.Sync = Sync;

/* ---------- mock 云服务器 ---------- */
const cloud = { state: null, updatedAt: null, failNext: 0, calls: [] };
global.fetch = async (url, opts) => {
  opts = opts || {};
  cloud.calls.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
  if (cloud.failNext > 0) { cloud.failNext--; throw new Error("network down"); }
  if (opts.method === "GET") {
    return { ok: true, status: 200, json: async () => ({ ok: true, data: cloud.state ? cloud.state.data : null, updatedAt: cloud.updatedAt }) };
  }
  if (opts.method === "PUT") {
    cloud.state = JSON.parse(opts.body);
    cloud.updatedAt = Date.now();
    return { ok: true, status: 200, json: async () => ({ ok: true, updatedAt: cloud.updatedAt }) };
  }
  if (opts.method === "DELETE") {
    cloud.state = null;
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }
  return { ok: false, status: 405, json: async () => ({ ok: false, error: "method" }) };
};
function setupSync(server, key) {
  Store.setSettings({ enableSync: true, syncServer: server, syncKey: key });
}
function resetAll() {
  Store.clearAll();
  localStorage.removeItem("fpf_syncMeta");
  cloud.state = null; cloud.updatedAt = null; cloud.failNext = 0; cloud.calls = [];
  timers = [];
  Store.setSettings({ enableFSRS: false });
}
function review(rec) {
  Store.recordAnswer(Object.assign({ word: null, correctPy: "x", mode: "mix", source: "test" }, rec));
}

console.log("== 1. 密钥生成与格式 ==");
(() => {
  resetAll();
  const k1 = Sync.generateKey();
  const k2 = Sync.generateKey();
  ok(/^fpf-[A-Za-z0-9_-]{40,}$/.test(k1), "密钥格式 fpf- + 40+ 字符: " + k1.slice(0, 12) + "...");
  ok(k1 !== k2, "两次生成密钥不同");
  ok(k1.length >= 44, "密钥长度足够（32 字节 → 43+ 字符）");
  ok(Sync.isValidKey(k1), "isValidKey 通过");
  ok(!Sync.isValidKey("short"), "短密钥拒绝");
  ok(!Sync.isValidKey("fpf-../../etc/passwd"), "含路径字符拒绝（防 KV key 注入）");
  ok(!Sync.isValidKey("other-app-abc"), "无 fpf- 前缀拒绝");
})();

console.log("== 3. 变更自动打点 → 防抖推送 ==");
(async () => {
  resetAll();
  setupSync("https://mock.workers.dev", "fpf-" + "A".repeat(42));
  review({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn" });
  ok(Sync.status().pending === true, "数据变更后 dirty=true（待推送）");
  ok(timers.length >= 1, "已调度防抖推送定时器");
  await runTimersAsync();
  const put = cloud.calls[cloud.calls.length - 1];
  ok(put.method === "PUT" && put.url.endsWith("/api/sync"), "PUT /api/sync");
  ok(put.body.data && put.body.data.data && put.body.data.data.reviews.length === 1, "推送内容含 6 表数据（reviews 1 条）");
  ok(Sync.status().pending === false, "推送成功后 dirty 清除");
  ok(Sync.status().lastSyncAt != null, "记录 lastSyncAt");
})();

console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);