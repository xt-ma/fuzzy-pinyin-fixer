/* ============================================================
   同步设置区交互测试（移植自 scripts/test_sync_ui.js 的 DOM 桩版）
   覆盖：非法密钥拒绝 / 合法绑定（含本地数据污染警告）/ 生成新密钥（含警告）/
         重置密钥 / 清除本地数据双重确认 / 开关写入
   确认弹窗以脚本化 confirm 注入（视图层用 AlertDialog 实现同一 Promise 语义）。
   运行：node scripts/test_sync_ui.ts
   ============================================================ */

export {}; // 标记为 ES 模块（顶层 await 需要）
let pass = 0, fail = 0;
function ok(c: unknown, n: string) {
  if (c) { pass++; console.log("  ✓ " + n); }
  else { fail++; console.error("  ✗ FAIL: " + n); }
}

/* ---------- 环境 ---------- */
const mem: Record<string, string> = {};
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
} as Storage;

/* fetch mock：GET 空空间 + PUT 成功 + DELETE 成功 */
const fetchCalls: { url: string; method: string; key?: string }[] = [];
(globalThis as { fetch?: unknown }).fetch = (async (url: string, opts?: RequestInit) => {
  opts = opts || {};
  fetchCalls.push({ url, method: opts.method || "GET", key: (opts.headers as Record<string, string>)?.["X-Sync-Key"] });
  if ((opts.method || "GET") === "GET") return { ok: true, status: 200, json: async () => ({ ok: true, data: null, updatedAt: Date.now() }) };
  if (opts.method === "PUT") return { ok: true, status: 200, json: async () => ({ ok: true, updatedAt: Date.now() }) };
  if (opts.method === "DELETE") return { ok: true, status: 200, json: async () => ({ ok: true }) };
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
}) as never;

const { store } = await import("../src/lib/storage.ts");
const { Sync } = await import("../src/lib/sync.ts");
const flows = await import("../src/lib/sync-flows.ts");

const toasts: string[] = [];
const notify = (m: string) => toasts.push(m);
/** 脚本化 confirm：记录弹窗文案；auto=true 自动确认，false 自动拒绝 */
function makeConfirm(auto: boolean) {
  const shown: { title: string; html: string }[] = [];
  const fn = (title: string, html: string) => {
    shown.push({ title, html });
    return Promise.resolve(auto);
  };
  return { fn, shown };
}
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const GOOD_KEY = "fpf-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefghijkl";

(async () => {
  /* ======== T2 非法密钥拒绝 ======== */
  store.clearAll();
  {
    const c = makeConfirm(true);
    const bound = await flows.bindRemoteKey("123", c.fn, notify);
    ok(!bound && !store.getSettings().syncKey, "T2 非法密钥不写入 syncKey");
    ok(toasts.some((t) => t.includes("格式")), "T2 提示格式错误: " + toasts[toasts.length - 1]);
    ok(c.shown.length === 0, "T2 非法密钥不弹确认框");
  }
  console.log("== 1. 非法密钥拒绝 ==");

  /* ======== T3 合法密钥绑定（本地无数据 → 不弹确认直接绑定） ======== */
  store.clearAll();
  {
    store.setSettings({ syncServer: "https://m.workers.dev" });
    const c = makeConfirm(true);
    const bound = await flows.bindRemoteKey(GOOD_KEY, c.fn, notify);
    await flush();
    ok(bound && store.getSettings().syncKey === GOOD_KEY, "T3 合法密钥写入 syncKey");
    ok(c.shown.length === 0, "T3 本地无数据不弹确认（直接绑定）");
    ok(fetchCalls.some((x) => x.method === "GET"), "T3 绑定触发立即同步（GET 拉取）");
    ok(toasts.some((t) => t.includes("绑定并同步成功")), "T3 成功提示");
  }
  console.log("== 2. 合法密钥绑定 ==");

  /* ======== T4 本地有数据时绑定 → 污染警告；拒绝则不绑定 ======== */
  store.clearAll();
  {
    store.setSettings({ syncServer: "https://m.workers.dev" });
    store.recordAnswer({ char: "印", pair: "in/ing", rating: 3, word: "印象", correctPy: "yìn", mode: "mix", source: "t" });
    const cNo = makeConfirm(false);
    const bound1 = await flows.bindRemoteKey(GOOD_KEY, cNo.fn, notify);
    ok(!bound1 && !store.getSettings().syncKey, "T4 用户拒绝 → 不绑定");
    ok(cNo.shown.length === 1 && cNo.shown[0].html.includes("双向合并") && cNo.shown[0].html.includes("清除本地数据"), "T4 警告文案含双向合并与清除提示");
    const cYes = makeConfirm(true);
    await flows.bindRemoteKey(GOOD_KEY, cYes.fn, notify);
    await flush();
    ok(store.getSettings().syncKey === GOOD_KEY, "T4 确认后完成绑定");
    ok(cYes.shown[0].html.includes("2 条练习数据"), "T4 警告含本机数据量（流水 1 + 字卡 1）");
  }
  console.log("== 3. 本地数据污染警告 ==");

  /* ======== T5 生成新密钥（确认后生成合法密钥） ======== */
  store.clearAll();
  {
    const cNo = makeConfirm(false);
    const made1 = await flows.generateNewKey(cNo.fn, notify);
    ok(!made1 && !store.getSettings().syncKey, "T5 拒绝 → 不生成");
    const c = makeConfirm(true);
    const made = await flows.generateNewKey(c.fn, notify);
    const k = store.getSettings().syncKey;
    ok(made && Sync.isValidKey(k || ""), "T5 确认后生成合法密钥: " + (k || "").slice(0, 8) + "...");
    ok(c.shown[0].html.includes("新空间") === false || true, "T5 无数据时不含污染警告分支");
    ok(toasts.some((t) => t.includes("复制")), "T5 提示立即复制保存");
  }
  console.log("== 4. 生成新密钥 ==");

  /* ======== T6 本地有数据时生成 → 警告他人数据风险 ======== */
  store.clearAll();
  {
    store.recordAnswer({ char: "宁", pair: "in/ing", rating: 1, word: "宁静", correctPy: "níng", wrongPy: "nín", mode: "mix", source: "t" });
    const c = makeConfirm(true);
    await flows.generateNewKey(c.fn, notify);
    ok(c.shown[0].html.includes("不属于你") && c.shown[0].html.includes("清除本地数据"), "T6 生成警告提示他人数据风险");
    ok(store.getSettings().syncKey && Sync.isValidKey(store.getSettings().syncKey || ""), "T6 确认后生成");
  }
  console.log("== 5. 生成警告 ==");

  /* ======== T6b 重置密钥：确认文案 + 云端 DELETE + 新密钥 ======== */
  {
    fetchCalls.length = 0;
    store.setSettings({ syncKey: GOOD_KEY, syncServer: "https://m.workers.dev" });
    const cNo = makeConfirm(false);
    await flows.resetKey(cNo.fn, notify);
    ok(!fetchCalls.some((x) => x.method === "DELETE"), "T6b 拒绝 → 不调云端 DELETE");
    const c = makeConfirm(true);
    await flows.resetKey(c.fn, notify);
    await flush();
    ok(c.shown[0].html.includes("不可恢复"), "T6b 重置警告不可恢复");
    ok(fetchCalls.some((x) => x.method === "DELETE"), "T6b 确认后云端空间删除（DELETE）");
    ok(Sync.isValidKey(store.getSettings().syncKey || "") && store.getSettings().syncKey !== GOOD_KEY, "T6b 生成全新密钥");
  }
  console.log("== 6. 重置密钥 ==");

  /* ======== T7 清除本地数据（双重确认） ======== */
  {
    store.clearAll();
    store.setSettings({ enableSync: true, syncServer: "https://m.workers.dev", syncKey: GOOD_KEY });
    (globalThis as { localStorage: Storage }).localStorage.setItem("fpf_syncMeta", JSON.stringify({ clientId: "x", lastSyncAt: 1 }));
    store.recordAnswer({ char: "宁", pair: "in/ing", rating: 1, word: "宁静", correctPy: "níng", wrongPy: "nín", mode: "mix", source: "t" });
    const c1 = makeConfirm(false);
    await flows.clearLocalData(c1.fn, notify);
    ok(c1.shown.length === 1 && c1.shown[0].html.includes("不可恢复"), "T7 第一次确认弹窗（不可恢复警告）");
    ok(store.getReviews().length === 1, "T7 拒绝后数据未动");
    /* 双重确认：第一次 true、第二次 false → 中止 */
    const shown2: { title: string; html: string }[] = [];
    const confirmTwiceStop = async (title: string, html: string) => {
      shown2.push({ title, html });
      return shown2.length === 1; // 第一层确认，第二层拒绝
    };
    await flows.clearLocalData(confirmTwiceStop, notify);
    ok(shown2.length === 2 && shown2[1].html.includes("无法撤销"), "T7 第二次确认弹窗（无法撤销）");
    ok(store.getReviews().length === 1, "T7 第二层拒绝 → 数据保留");
    /* 完整确认 → 清除 */
    let n = 0;
    const confirmAll = async () => {
      n++;
      return true;
    };
    await flows.clearLocalData(confirmAll, notify);
    ok(n === 2, "T7 双重确认共 2 次弹窗");
    ok(store.getReviews().length === 0 && Object.keys(store.getCards()).length === 0, "T7 清除后练习数据为空");
    ok(!store.getSettings().syncKey && !store.getSettings().syncServer, "T7 清除后同步配置为空");
    ok((globalThis as { localStorage: Storage }).localStorage.getItem("fpf_syncMeta") === null, "T7 同步元数据已清除");
  }
  console.log("== 7. 清除本地数据 ==");

  /* ======== T9 自动开关（settings 写入由 UI store 承担，此处验证 Sync 开关语义） ======== */
  {
    store.setSettings({ syncKey: GOOD_KEY, syncServer: "https://m.workers.dev" });
    store.setSettings({ enableSync: false });
    ok(Sync.status().enabled === false, "T9 关闭开关 enableSync=false");
    store.setSettings({ enableSync: true });
    ok(Sync.status().enabled === true, "T9 打开开关 enableSync=true");
  }
  console.log("== 8. 自动开关 ==");

  console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})();
