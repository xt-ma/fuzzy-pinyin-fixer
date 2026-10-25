/* PWA 配置（唯一事实来源）
   - vite.config.ts 引用此处生成 manifest 与 Service Worker
   - scripts/test_mobile.ts 静态校验此处内容
   注意：manifest 故意只含 192 图标——使站点不满足 Chrome 可安装条件（需 192+512），
   避免 Android Chrome 触发 WebAPK 云端打包（国内网络连不上 Google 导致安装失败），
   退回本地快捷方式路径，仍按 manifest 以 standalone 窗口打开。
   start_url 用 "./"：Pages 会 308 重定向 /index.html，重定向响应进缓存会致 ERR_FAILED。 */

export interface PwaManifest { name: string; short_name: string; description: string; lang: string; start_url: string; scope: string; display: string; orientation: string; theme_color: string; background_color: string; icons: { src: string; sizes: string; type: string; purpose: string }[] }

export const PWA_MANIFEST: PwaManifest = {
  name: "模糊音克星 · 纠正方言模糊音",
  short_name: "模糊音克星",
  description: "针对 in/ing、en/eng、l/n 不分的专项练习工具，含 FSRS 记忆调度与云同步",
  lang: "zh-CN",
  start_url: "./",
  scope: "./",
  display: "standalone",
  orientation: "portrait",
  theme_color: "#0f172a",
  background_color: "#f8fafc",
  icons: [
    {
      src: "icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
  ],
} satisfies Record<string, unknown>;
