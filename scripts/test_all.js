/* ============================================================
   测试聚合入口：按顺序运行全部测试套件，汇总结果
   用法：node scripts/test_all.js （或 npm test）
   pre-commit 钩子（scripts/git-hooks/）依赖本脚本非零退出码拦截提交
   ============================================================ */
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

const SUITES = [
  "test_logic.js",      // 词库完整性 + 出题逻辑
  "test_features.js",   // 已掌握 + 回溯
  "test_sync.js",       // 导出/导入/合并
  "test_fsrs.js",       // FSRS 调度
  "test_sync_auto.js",  // 自动云同步状态机
  "test_sync_ui.js",    // 同步设置区 UI
  "test_mobile.js",     // 移动端/PWA 静态检查
  "test_tts.js",        // TTS 朗读
];

let failed = [];
let totalAssertions = 0;
for (const suite of SUITES) {
  const r = spawnSync(process.execPath, [path.join(__dirname, suite)], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  const m = out.match(/(\d+)\s*通过[^\d]*\d+\s*失败/);
  const passed = m ? +m[1] : null;
  if (r.status !== 0) {
    failed.push(suite);
    console.error(`✗ ${suite}（退出码 ${r.status}），输出末尾：`);
    const lines = out.trimEnd().split("\n");
    console.error(lines.slice(-30).join("\n"));
  } else {
    if (passed != null) totalAssertions += passed;
    console.log(`✓ ${suite}${passed != null ? `（${passed} 断言）` : ""}`);
  }
}

console.log("\n========== 测试汇总 ==========");
if (failed.length) {
  console.error(`失败套件：${failed.join(", ")}`);
  process.exit(1);
}
console.log(`全部 ${SUITES.length} 个套件通过，共 ${totalAssertions} 条断言`);
