/* ============================================================
   模糊音克星 · 自动云同步测试（scripts/test_sync_auto.js）
   覆盖：密钥生成/格式 / 变更打点 / 防抖推送 / 失败重试 /
         拉取合并 / suppress 抑制 / exportData 剥离 / 双设备 roundtrip
   运行：node scripts/test_sync_auto.js
   ============================================================ */
"use strict";
const { memLocalStorage, loadWordsData, evalModules, createManualTimers } = require("./helpers/test-env.js");
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL: " + name); }
}

/* ---------- 可控定时器（同步执行，等待异步完成） ---------- */
const timers = createManualTimers();
global.setTimeout = timers.setTimeout;
global.clearTimeout = timers.clearTimeout;

/* ---------- 环境 ---------- */
global.localStorage = memLocalStorage();
global.window = { WORDS_DATA: loadWordsData() };
evalModules(["js/fsrs.js", "js/store.js", "js/sync.js", "js/quiz.js"]);
const Store = global.window.Store, Sync = global.window.Sync;
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
  timers.reset();
  Store.setSettings({ enableFSRS: false });
}
function review(rec) {
  Store.recordAnswer(Object.assign({ word: null, correctPy: "x", mode: "mix", source: "test" }, rec));
}

/* ---------- 测试主流程（顺序 await，避免 process.exit 提前终止 async） ---------- */
(async () => {
  console.log("== 1. 密钥生成与格式 ==");
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

  console.log("== 2. exportData 剥离同步配置 ==");
  resetAll();
  Store.setSettings({ syncKey: "fpf-" + "A".repeat(42), syncServer: "https://x.workers.dev", enableSync: true, defaultCount: 7 });
  const exp = Store.exportData();
  ok(exp.data.settings.defaultCount === 7, "业务设置保留");
  ok(exp.data.settings.syncKey === undefined && exp.data.settings.syncServer === undefined && exp.data.settings.enableSync === undefined,
    "同步配置（密钥/地址/开关）不随数据外传");

  console.log("== 3. 变更自动打点 → 防抖推送 ==");
  resetAll();
  setupSync("https://mock.workers.dev", "fpf-" + "A".repeat(42));
  review({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn" });
  ok(Sync.status().pending === true, "数据变更后 dirty=true（待推送）");
  ok(timers.pending() >= 1, "已调度防抖推送定时器");
  await timers.run();
  const put = cloud.calls[cloud.calls.length - 1];
  ok(put.method === "PUT" && put.url.endsWith("/api/sync"), "PUT /api/sync");
  ok(put.body.data && put.body.data.data && put.body.data.data.reviews.length === 1, "推送内容含 6 表数据（reviews 1 条）");
  ok(Sync.status().pending === false, "推送成功后 dirty 清除");
  ok(Sync.status().lastSyncAt != null, "记录 lastSyncAt");

  console.log("== 4. 推送失败 → 保留脏标记 + 指数退避重试 ==");
  resetAll();
  setupSync("https://mock.workers.dev", "fpf-" + "B".repeat(42));
  cloud.failNext = 1;
  review({ char: "林", pair: "in/ing", rating: 3, word: "树林", correctPy: "lín" });
  await timers.run();
  ok(Sync.status().pending === false, "重试成功后 dirty 清除");
  ok(cloud.state && cloud.state.data.data.reviews.length === 1, "云端最终收到数据");

  console.log("== 4b. 失败中间态（单独验证） ==");
  resetAll();
  setupSync("https://mock.workers.dev", "fpf-" + "B2".repeat(21));
  cloud.failNext = 1;
  review({ char: "林", pair: "in/ing", rating: 3, word: "树林", correctPy: "lín" });
  for (const fn of timers.takePending()) await fn();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  ok(Sync.status().pending === true, "推送失败后 dirty 保留");
  ok(Sync.status().error != null, "记录错误信息: " + Sync.status().error);
  ok(timers.pending() >= 1, "已调度重试定时器");
  await timers.run();
  ok(Sync.status().pending === false, "重试成功后 dirty 清除");

  console.log("== 5. 拉取合并（第二台设备接入） ==");
  resetAll();
  const keyC = "fpf-" + "C".repeat(42);
  cloud.state = {
    data: {
      app: "fuzzy-pinyin-fixer", version: 2, exportedAt: new Date().toISOString(),
      data: {
        reviews: [
          { char: "龙", pair: "l/n", ts: 1000, rating: 1, state: 0, elapsedDays: null, scheduledDays: null, stability: null, difficulty: null, word: "龙", correctPy: "lóng", wrongPy: "nóng", mode: "mix", source: "test", fromFSRS: false },
          { char: "宁", pair: "in/ing", ts: 2000, rating: 3, state: 0, elapsedDays: null, scheduledDays: null, stability: null, difficulty: null, word: "宁静", correctPy: "níng", wrongPy: null, mode: "mix", source: "test", fromFSRS: false },
        ],
        cards: {}, wrongBook: { "龙": { char: "龙", pair: "l/n", wrongPy: "nóng", correctPy: "lóng", word: "龙", count: 1, streak: 0, lastTime: 1000 } },
        mastered: {}, history: [], settings: { defaultCount: 5 },
      },
    },
    updatedAt: Date.now(),
  };
  setupSync("https://mock.workers.dev", keyC);
  await Sync.pull();
  ok(Store.getReviews().length === 2, "拉取合并：云端 2 条流水并入本地");
  ok(Store.getWrongBook()["龙"] && Store.getWrongBook()["龙"].count === 1, "云端错题并入");
  ok(Store.getSettings().defaultCount === 5, "云端设置并入（本地无记录时）");

  console.log("== 6. suppress 抑制：导入合并不触发推送 ==");
  resetAll();
  setupSync("https://mock.workers.dev", "fpf-" + "D".repeat(42));
  await timers.run();
  const callsBefore = cloud.calls.length;
  Store._withSuppress(() => {
    Store.set("reviews", []);
    Store.set("cards", {});
  });
  ok(cloud.calls.length === callsBefore, "抑制期间写入不触发同步推送");
  review({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn" });
  ok(Sync.status().pending === true, "抑制结束后正常打点恢复");
  await timers.run();

  console.log("== 7. 双设备 roundtrip（A 答 2 题 → B 拉取 → B 答 1 题 → A 拉取） ==");
  resetAll();
  const keyE = "fpf-" + "E".repeat(42);
  setupSync("https://mock.workers.dev", keyE);
  review({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn" });
  review({ char: "林", pair: "in/ing", rating: 1, word: "树林", correctPy: "lín", wrongPy: "líng" });
  await timers.run();
  ok(cloud.state && cloud.state.data.data.reviews.length === 2, "A 推送 2 条流水到云端");

  Store.clearAll();
  localStorage.removeItem("fpf_syncMeta");
  Store.setSettings({ enableFSRS: false });
  setupSync("https://mock.workers.dev", keyE);
  await Sync.pull();
  ok(Store.getReviews().length === 2, "B 拉取到 A 的 2 条流水");
  review({ char: "龙", pair: "l/n", rating: 3, word: "龙", correctPy: "lóng" });
  await timers.run();
  ok(cloud.state.data.data.reviews.length === 3, "B 推送后云端 3 条（含 A 的 2 条）");

  Store.clearAll();
  Store.setSettings({ enableFSRS: false });
  setupSync("https://mock.workers.dev", keyE);
  await Sync.pull();
  ok(Store.getReviews().length === 3, "A 重新拉取得到 3 条（双向合并不丢）");

  console.log("== 8. 开关关闭：不再自动推送 ==");
  resetAll();
  Store.setSettings({ enableSync: false, syncServer: "https://mock.workers.dev", syncKey: "fpf-" + "F".repeat(42) });
  const callsBefore8 = cloud.calls.length;
  review({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn" });
  ok(Sync.status().pending === false, "关闭同步后 dirty 不置位");
  ok(cloud.calls.length === callsBefore8 && timers.pending() === 0, "关闭同步后无推送");

  console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})();
