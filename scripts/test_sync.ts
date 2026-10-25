/* ============================================================
   模糊音克星 · 数据导入导出测试（移植自 scripts/test_sync.js）
   覆盖：导出完整性 / 导入合并（各表策略）/ 校验拒绝 / 幂等 / 裁剪 / roundtrip
   运行：node scripts/test_sync.ts
   ============================================================ */

export {}; // 标记为 ES 模块（顶层 await 需要）
let pass = 0, fail = 0;
function ok(cond: unknown, name: string) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ FAIL: " + name); }
}

/* ---------- 环境 ---------- */
const mem: Record<string, string> = {};
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
} as Storage;

// 仅加载 storage（导入导出不依赖 quiz）
const { store, EXPORT_VERSION } = await import("../src/lib/storage.ts");

function resetLocal() {
  store.clearAll();
}

// 造数据辅助
function rev(char: string, pair: string, ts: number, rating: number) {
  return { char, pair, ts, rating, state: 0, elapsedDays: null, scheduledDays: null, stability: null, difficulty: null, word: null, correctPy: "x", wrongPy: null, mode: "mix", source: "test" };
}

console.log("== 1. 导出完整性 ==");
{
  resetLocal();
  // 灌入本地数据
  store.recordAnswer(rev("宁", "in/ing", 1700000000000, 3) as never);
  store.addWrong({ char: "宁", pair: "in/ing", wrongPy: "nín", correctPy: "níng", word: "宁静" });
  store.addMastered("宁", "in/ing");
  store.addHistory({ mode: "mix", pair: null, total: 5, correct: 4 });
  store.setSettings({ defaultCount: 20 });

  const exp = store.exportData();
  ok(exp.app === "fuzzy-pinyin-fixer", "app 标识正确");
  ok(typeof exp.version === "number" && exp.version === EXPORT_VERSION, "版本号 = EXPORT_VERSION");
  ok(typeof exp.exportedAt === "string" && !isNaN(Date.parse(exp.exportedAt)), "exportedAt 为合法时间");
  const tables = ["reviews", "cards", "wrongBook", "mastered", "history", "settings"];
  ok(tables.every((t) => (exp.data as Record<string, unknown>)[t] !== undefined), "6 张表齐全: " + tables.join("/"));
  ok(Array.isArray(exp.data.reviews) && exp.data.reviews.length === 1, "reviews 数组含 1 条");
  ok(typeof exp.data.cards === "object" && Object.keys(exp.data.cards).length === 1, "cards 含 1 张");
}

console.log("== 2. reviews 合并：按 (char,pair,ts) 去重 ==");
{
  resetLocal();
  store.recordAnswer(rev("宁", "in/ing", 1000, 3) as never); // 本地 1 条
  const remote = store.exportData();
  // 远端：1 条与本地重复 + 2 条新增
  remote.data.reviews.push(rev("宁", "in/ing", 1000, 3) as never); // 重复
  remote.data.reviews.push(rev("林", "in/ing", 2000, 3) as never); // 新
  remote.data.reviews.push(rev("龙", "l/n", 3000, 1) as never); // 新（答错）
  // 清空本地再导入（模拟换设备首次导入：本地为空）
  store.clearAll();
  const res = store.importData(remote);
  ok(res.ok, "导入成功");
  ok(res.ok && res.merged.reviews === 3, "新增 3 条流水（重复的 1 条未计数）");
  const rv = store.getReviews();
  ok(rv.length === 3, "合并后共 3 条");
  ok(rv.every((r, i) => i === 0 || r.ts > rv[i - 1].ts), "按 ts 升序");
  // 本地已有 + 远端合并（双向）
  store.clearAll();
  store.recordAnswer(rev("冰", "in/ing", 500, 3) as never);
  const res2 = store.importData(remote);
  ok(res2.ok && store.getReviews().length === 4, "本地 1 + 远端 3 = 4 条双向合并");
}

console.log("== 3. cards 合并：同 key 取 lastTs 较新 ==");
{
  resetLocal();
  store.recordAnswer(rev("宁", "in/ing", 1000, 3) as never); // 本地卡 lastTs=1000
  const localCards = store.getCards();
  ok(localCards["in/ing:宁"].reps === 1, "本地卡 reps=1");
  // 构造远端：同 key 但 lastTs 更大
  const remote = store.exportData();
  remote.data.cards["in/ing:宁"] = { char: "宁", pair: "in/ing", state: 0, stability: null, difficulty: null, due: null, scheduledDays: null, reps: 5, correctCount: 4, wrongCount: 1, firstTs: 100, lastTs: 9999, lastRating: 3 };
  // 远端新增另一张卡
  remote.data.cards["l/n:龙"] = { char: "龙", pair: "l/n", state: 0, stability: null, difficulty: null, due: null, scheduledDays: null, reps: 2, correctCount: 1, wrongCount: 1, firstTs: 500, lastTs: 5000, lastRating: 1 };
  const res = store.importData(remote);
  const cards = store.getCards();
  ok(cards["in/ing:宁"].reps === 5, "同 key 冲突取 lastTs 较新（reps 5 覆盖 1）");
  ok(cards["l/n:龙"].reps === 2, "远端独有卡并入");
  ok(res.ok && res.merged.cards === 2, "cards 新增计数 = 2");
}

console.log("== 4. wrongBook / mastered 合并：冲突取新 + hidden 保留 ==");
{
  resetLocal();
  store.addWrong({ char: "龙", pair: "l/n", wrongPy: "lóng", correctPy: "nóng", word: "农" });
  store.addMastered("宁", "in/ing");
  // 模拟「龙」已被标记已掌握而隐藏（本地状态）
  store.addMastered("龙", "l/n");
  const wb0 = store.getWrongBook();
  wb0["龙"].hidden = true;
  store.set("wrongBook", wb0);
  const remote = store.exportData();
  // 远端：龙 更新 lastTime 更大（比本地真实时间戳新）；新增 曼；宁 的 mastered time 更大
  const farFuture = Date.now() + 100000;
  remote.data.wrongBook["龙"].lastTime = farFuture;
  remote.data.wrongBook["龙"].count = 3;
  remote.data.wrongBook["曼"] = { char: "曼", pair: "l/n", wrongPy: "làn", correctPy: "màn", word: "曼", count: 1, streak: 0, lastTime: farFuture };
  remote.data.mastered["宁"].time = farFuture;
  const res = store.importData(remote);
  const wb = store.getWrongBook();
  ok(wb["龙"].lastTime === farFuture && wb["龙"].count === 3, "wrongBook 冲突取 lastTime 较新");
  ok(wb["龙"].hidden === true, "替换时保护本地 hidden 标记（不丢失）");
  ok(wb["曼"] && wb["曼"].count === 1, "远端独有错题并入");
  ok(store.getMastered()["宁"].time === farFuture, "mastered 冲突取 time 较新");
  ok(res.ok && res.merged.wrongBook === 2 && res.merged.mastered === 1, "计数正确（龙冲突覆盖 + 曼新增）");
}

console.log("== 5. history 合并：整条去重 ==");
{
  resetLocal();
  store.addHistory({ date: 1000, mode: "mix", pair: null, total: 5, correct: 4 });
  const remote = store.exportData();
  remote.data.history.push({ date: 1000, mode: "mix", pair: null, total: 5, correct: 4 }); // 重复
  remote.data.history.push({ date: 2000, mode: "pair", pair: "l/n", total: 10, correct: 8 }); // 新
  const res = store.importData(remote);
  ok(store.getHistory().length === 2, "去重后 2 条");
  ok(res.ok && res.merged.history === 1, "history 新增 1 条");
}

console.log("== 6. settings 合并：本地优先、补远端独有 ==");
{
  resetLocal();
  store.setSettings({ defaultCount: 30 });
  const remote = store.exportData();
  remote.data.settings = { defaultCount: 5, theme: "dark" }; // 远端改了 defaultCount + 新增 theme
  const res = store.importData(remote);
  const st = store.getSettings();
  ok(st.defaultCount === 30, "defaultCount 保留本地（30 不被覆盖为 5）");
  ok((st as Record<string, unknown>).theme === "dark", "远端独有键 theme 并入");
}

console.log("== 7. 校验拒绝 ==");
{
  resetLocal();
  store.recordAnswer(rev("宁", "in/ing", 1000, 3) as never);
  // 非 JSON
  let res = store.importData("{ not json");
  ok(!res.ok && /JSON/.test(res.error), "损坏 JSON 拒绝");
  // 非本应用
  res = store.importData({ app: "other-app", version: 2, data: {} });
  ok(!res.ok && /不是/.test(res.error), "非本应用备份拒绝");
  // 版本过高
  res = store.importData({ app: "fuzzy-pinyin-fixer", version: 99, data: {} });
  ok(!res.ok && /版本过高/.test(res.error), "版本过高拒绝");
  // 缺 data
  res = store.importData({ app: "fuzzy-pinyin-fixer", version: 2 });
  ok(!res.ok && /data/.test(res.error), "缺 data 段拒绝");
  // 空对象
  res = store.importData({});
  ok(!res.ok, "空对象拒绝");
  // 拒绝后本地数据未被破坏
  ok(store.getReviews().length === 1, "拒绝导入不影响本地数据");
}

console.log("== 8. 重复导入幂等 ==");
{
  resetLocal();
  store.recordAnswer(rev("宁", "in/ing", 1000, 3) as never);
  const remote = store.exportData();
  const r1 = store.importData(remote);
  ok(r1.ok && r1.merged.reviews === 0 && r1.merged.cards === 0, "首次重复导入新增为 0");
  const r2 = store.importData(remote);
  ok(r2.ok && r2.merged.reviews === 0 && r2.merged.cards === 0 && store.getReviews().length === 1, "二次导入仍幂等");
}

console.log("== 9. reviews 超限裁剪 ==");
{
  resetLocal();
  // 直接写入 29995 条本地流水（避免 recordAnswer 的 O(n²) 全量序列化）
  const big = [];
  for (let i = 0; i < 29995; i++) big.push(rev("宁", "in/ing", 1000 + i, 3));
  (globalThis as { localStorage: Storage }).localStorage.setItem("fpf_reviews", JSON.stringify(big));
  const remote = store.exportData();
  // 远端 20 条新的（ts 更大）
  for (let i = 0; i < 20; i++) remote.data.reviews.push(rev("林", "in/ing", 900000000000 + i, 3) as never);
  const res = store.importData(remote);
  ok(res.ok, "导入成功");
  const rv = store.getReviews();
  ok(rv.length === 30000, "合并后裁剪至 30000 条");
  ok(rv[rv.length - 1].char === "林" && rv[0].char === "宁", "保留最新（最旧的宁被裁掉，最新的林在最尾）");
  ok(rv[0].ts === 1000 + 15, "恰好裁掉最旧 15 条（30015-30000）");
}

console.log("== 10. roundtrip：导出 → 清空 → 导入 ==");
{
  resetLocal();
  store.recordAnswer(rev("宁", "in/ing", 1000, 3) as never);
  store.recordAnswer(rev("林", "in/ing", 2000, 1) as never);
  store.addWrong({ char: "林", pair: "in/ing", wrongPy: "líng", correctPy: "lín", word: "树林" });
  store.addMastered("宁", "in/ing");
  store.addHistory({ date: 1000, mode: "mix", pair: null, total: 5, correct: 4 });
  store.setSettings({ defaultCount: 15 });
  const backup = JSON.parse(JSON.stringify(store.exportData())); // 模拟落盘再读回
  store.clearAll();
  const res = store.importData(backup);
  ok(res.ok, "roundtrip 导入成功");
  ok(store.getReviews().length === 2, "流水 2 条恢复");
  ok(Object.keys(store.getCards()).length === 2, "字卡 2 张恢复");
  ok(Object.keys(store.getWrongBook()).length === 1, "错题 1 条恢复");
  ok(Object.keys(store.getMastered()).length === 1, "已掌握 1 字恢复");
  ok(store.getHistory().length === 1, "轮次 1 条恢复");
  ok(store.getSettings().defaultCount === 15, "设置恢复");
  // 合并后新增计数：全部为 0（本地已清空但远端数据都在，added 指"相对本地新增"）
  ok(res.ok && res.merged.reviews === 2 && res.merged.cards === 2, "roundtrip 新增计数正确");
}

console.log("== 11. 混合脏数据：跳过坏条目、保留好条目 ==");
{
  resetLocal();
  const remote = store.exportData();
  remote.data.reviews.push(rev("宁", "in/ing", 1000, 3) as never);
  remote.data.reviews.push({ garbage: true } as never);
  remote.data.reviews.push(null as never);
  remote.data.wrongBook = { "曼": null } as never; // 坏对象表条目
  const res = store.importData(remote);
  ok(res.ok, "含脏数据仍导入成功");
  ok(store.getReviews().length === 1, "坏流水条目被跳过");
  ok(Object.keys(store.getWrongBook()).length === 0, "坏错题条目被跳过");
}

console.log("\n结果: " + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
