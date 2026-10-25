/* ============================================================
   模糊音克星 · 新栈移动端 / PWA / 依赖治理静态测试（scripts/test_mobile.ts）
   覆盖：PWA manifest 策略 / index.html 元信息 / 六库齐全且无重复依赖 /
        触控热区 / 无障碍（键盘作答、aria、reduced-motion）
   运行：node scripts/test_mobile.ts（由 scripts/test_all.js 统一调度）
   ============================================================ */
export {};

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
function ok(cond: boolean, name: string) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ FAIL: " + name); }
}
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

console.log("== 1. PWA manifest（src/pwa.ts 唯一事实来源） ==");
{
  const pwa = read("src/pwa.ts");
  // 故意只含 192 图标：不满足 Chrome 可安装条件（需 192+512），
  // 避免 Android Chrome 触发 WebAPK 云端打包（国内网络连不上 Google），
  // 退回本地快捷方式路径，仍按 standalone 窗口打开
  ok(pwa.includes("icon-192") && !pwa.includes("icon-512"), "manifest 仅声明 192 图标（故意禁用 Chrome 安装，见注释）");
  ok(pwa.includes('start_url: "./"') && pwa.includes('scope: "./"'), "start_url/scope 用 ./（Pages 308 重定向进缓存会致 ERR_FAILED）");
  ok(pwa.includes('display: "standalone"'), "display: standalone（独立窗口体验）");
  ok(pwa.includes('lang: "zh-CN"'), "lang: zh-CN");
  ok(existsSync(join(ROOT, "public", "icons", "icon-192.png")), "public/icons/icon-192.png 存在（Vite 经 public/ 拷入 dist）");
}

console.log("== 2. index.html / 构建入口 ==");
{
  const html = read("index.html");
  ok(html.includes("viewport-fit=cover"), "viewport 含 viewport-fit=cover（安全区适配）");
  ok(html.includes('name="theme-color"'), "声明 theme-color（状态栏融合）");
  ok(html.includes("/src/main.tsx"), "入口指向 /src/main.tsx（Vite）");
  ok(!/src="js\//.test(html), "不再引用旧版 js/ 脚本");
  const main = read("src/main.tsx");
  ok(main.includes("virtual:pwa-register"), "main.tsx 注册 PWA Service Worker");
  const viteCfg = read("vite.config.ts");
  ok(viteCfg.includes("VitePWA("), "vite.config.ts 启用 vite-plugin-pwa");
  ok(viteCfg.includes("navigateFallback") && viteCfg.includes("api\\/sync"), "SW 导航回退且放行 /api/sync（同步不走缓存）");
}

console.log("== 3. 依赖治理（六库齐全 · 无重复实现） ==");
{
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  const deps = Object.keys(pkg.dependencies);
  const all = [...deps, ...Object.keys(pkg.devDependencies)];
  const need = ["react", "react-dom", "zustand", "motion", "lucide-react", "react-resizable-panels", "@dnd-kit/core", "@dnd-kit/sortable"];
  for (const n of need) ok(deps.includes(n), `核心库 ${n} 在 dependencies`);
  // 图标统一 Lucide：禁其它图标库
  const iconLibs = all.filter((d) => /react-icons|@iconify|heroicons|@fortawesome|feather-icons/.test(d));
  ok(iconLibs.length === 0, "图标库唯一（lucide-react），无 " + (iconLibs.join(", ") || "重复"));
  // 动画统一 Motion：禁 framer-motion 双轨（motion 是其官方更名包）
  ok(!all.includes("framer-motion"), "动画库唯一（motion），无 framer-motion 双轨");
  ok(!all.includes("recharts") && !all.includes("d3"), "统计图为原生 SVG，未引入图表库");
  // UI 组件源码可控（shadcn 风格）：radix 原语仅作无头行为层
  ok(deps.filter((d) => d.startsWith("@radix-ui/")).length >= 5, "radix 无头原语 ≥5 个（shadcn 风格组件的行为层）");
  ok(deps.includes("class-variance-authority") && deps.includes("clsx") && deps.includes("tailwind-merge"), "CVA + clsx + tailwind-merge（shadcn 变体体系）");
  // 源码里无第二动画/图标体系引用
  const appSrc = read("src/App.tsx") + read("src/views/quiz.tsx");
  ok(!appSrc.includes("framer-motion"), "视图层只从 motion/react 导入");
  ok(appSrc.includes('from "lucide-react"'), "图标统一从 lucide-react 导入");
}

console.log("== 4. 触控与键盘（答题页交互） ==");
{
  const quiz = read("src/views/quiz.tsx");
  ok(quiz.includes('window.addEventListener("keydown"') && quiz.includes("/^[1-4]$/.test(ev.key)"), "数字键 1-4 作答（键盘监听挂在 window，视图切换自动卸载）");
  ok(quiz.includes('ev.key === "ArrowLeft"'), "← 键回溯上一题");
  ok(quiz.includes("min-h-11"), "选项按钮 min-h-11（≥44px 触控热区）");
  const shell = read("src/components/app/app-shell.tsx");
  ok(shell.includes("min-h-11"), "导航项 min-h-11 触控热区");
}

console.log("== 5. 无障碍与动效偏好 ==");
{
  const quiz = read("src/views/quiz.tsx");
  ok(quiz.includes('aria-label="切换作答朗读"') && quiz.includes("aria-pressed"), "朗读开关带 aria-label + aria-pressed 状态");
  ok(quiz.includes('aria-label="答题进度"'), "进度条声明 aria-label");
  const app = read("src/App.tsx");
  ok(app.includes('reducedMotion="user"'), "MotionConfig reducedMotion=user（跟随系统减弱动效）");
  const css = read("src/index.css");
  ok(css.includes(":focus-visible"), "焦点可见样式（:focus-visible）");
  ok(css.includes("@media (prefers-reduced-motion: reduce)"), "CSS 尊重 prefers-reduced-motion");
  ok(css.includes("@media (pointer: coarse)"), "触屏媒体查询（隐藏数字键角标 .kbd）");
  const tts = read("src/lib/tts.ts");
  ok(tts.includes("onDegraded"), "TTS 引擎降级回调（App 层 toast 提示）");
}

console.log(`\n== 结果：${pass} 通过 / ${fail} 失败 ==`);
process.exit(fail ? 1 : 0);
