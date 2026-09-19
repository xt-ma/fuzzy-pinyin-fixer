/* ============================================================
   模糊音克星 · Service Worker（PWA 离线壳缓存）
   - 缓存应用壳：页面 / 样式 / 脚本 / 词库数据
   - 策略：缓存优先 → 回源更新缓存（stale-while-revalidate）
   - 云同步 API（/api/）与跨域请求不缓存，始终走网络
   - 更新：版本号 + skipWaiting/clientsClaim，发布新版本自动生效
   仅 https 环境生效（file:// 下浏览器不注册本文件）
   ============================================================ */
const CACHE_NAME = "fpf-shell-v9"; // 每次发版递增：activate 时删除旧缓存，配合 skipWaiting 立即生效
const SHELL_ASSETS = [
  "./",
  "./css/style.css",
  "./js/store.js",
  "./js/fsrs.js",
  "./js/tts.js",
  "./js/quiz.js",
  "./js/sync.js",
  "./js/app.js",
  "./data/words.js",
  "./manifest.json",
  "./icons/icon-192.png", // manifest 仅声明 192（512 已移除，勿再缓存）
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨域（含云同步 API 所在域名）不缓存
  if (url.pathname.indexOf("/api/") >= 0) return;  // 同步 API 始终走网络

  // Cloudflare Pages 将 /index.html 永久重定向到 /：跟随重定向后的缓存响应
  // 若由 respondWith 返回给导航请求会导致 ERR_FAILED（已安装 PWA 启动失败的根因），
  // 故将此类导航统一归一化为根路径查缓存/回源（不缓存 ./index.html 条目）
  const cacheKey =
    req.mode === "navigate" && url.pathname.endsWith("/index.html")
      ? new Request(url.origin + "/")
      : req;

  event.respondWith(
    caches.match(cacheKey).then((hit) => {
      if (hit) {
        // 命中缓存：立即返回，同时后台回源刷新缓存
        fetch(cacheKey)
          .then((res) => {
            if (res && res.ok) caches.open(CACHE_NAME).then((c) => c.put(cacheKey, res));
          })
          .catch(() => {});
        return hit;
      }
      return fetch(cacheKey).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(cacheKey, copy));
        }
        return res;
      }).catch(() => caches.match("./")); // 离线兜底：返回应用壳
    })
  );
});
