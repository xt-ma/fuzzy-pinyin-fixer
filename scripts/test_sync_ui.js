"use strict";
/* ============================================================
   同步设置区 UI 交互测试
   覆盖：未绑定态 / 非法密钥拒绝 / 合法绑定 / 本地数据污染警告 /
   生成新密钥（含警告）/ 清除本地数据双重确认 / 输入框不回填 / 自动开关
   ============================================================ */
const { createAppEnv, evalModules, lastMask, clickMaskOk, maskText } = require("./helpers/test-env.js");
let pass = 0, fail = 0;
function ok(c, n) { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ FAIL: " + n); } }

/* ---------- 环境（DOM 桩 + 元素注册表见 helpers/test-env.js） ---------- */
const { els, fireDomReady } = createAppEnv({ timers: "immediate" });

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

evalModules([
  "js/fsrs.js", "js/store.js", "js/quiz.js", "js/sync.js", "js/ui.js",
  "js/view-home.js", "js/view-quiz.js", "js/view-result.js", "js/view-stats.js",
  "js/view-mastered.js", "js/view-wrongbook.js", "js/view-settings.js",
  "js/app.js",
]);
global.Store = global.window.Store; global.FSRS = global.window.FSRS;
global.Quiz = global.window.Quiz; global.Sync = global.window.Sync;
const Store = global.window.Store, App = global.window.App, Sync = global.window.Sync;
fireDomReady();

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
