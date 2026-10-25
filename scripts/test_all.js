/* ============================================================
   测试聚合入口：按顺序运行全部测试套件，汇总结果
   用法：node scripts/test_all.js （或 npm test）
   pre-commit 钩子（scripts/git-hooks/）依赖本脚本非零退出码拦截提交
   套件为 .ts（Node ≥24 原生类型剥离直接运行，无需 ts-node）
   ============================================================ */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUITES = [
  "test_logic.ts",      // 词库完整性 + 出题逻辑
  "test_features.ts",   // 已掌握 + 回溯
  "test_sync.ts",       // 导出/导入/合并
  "test_fsrs.ts",       // FSRS 调度
  "test_sync_auto.ts",  // 自动云同步状态机
  "test_sync_ui.ts",    // 同步设置区交互（sync-flows）
  "test_mobile.ts",     // 新栈静态检查：PWA/依赖治理/无障碍
  "test_tts.ts",        // TTS 朗读
];

let failed = [];
let totalAssertions = 0;
for (const suite of SUITES) {
  const r = spawnSync(process.execPath, [join(__dirname, suite)], {
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
