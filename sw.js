/* ============================================================
   模糊音克星 · Service Worker（PWA 离线壳缓存）
   - 缓存应用壳：页面 / 样式 / 脚本 / 词库数据
   - 策略：缓存优先 → 回源更新缓存（stale-while-revalidate）
   - 云同步 API（/api/）与跨域请求不缓存，始终走网络
   - 更新：版本号 + skipWaiting/clientsClaim，发布新版本自动生效
   仅 https 环境生效（file:// 下浏览器不注册本文件）
   ============================================================ */
const CACHE_NAME = "fpf-shell-v3"; // 每次发版递增：activate 时删除旧缓存，配合 skipWaiting 立即生效
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/store.js",
  "./js/fsrs.js",
  "./js/tts.js",
  "./js/quiz.js",
  "./js/sync.js",
  "./js/app.js",
  "./data/words.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
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

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // 命中缓存：立即返回，同时后台回源刷新缓存
        fetch(req)
          .then((res) => {
            if (res && res.ok) caches.open(CACHE_NAME).then((c) => c.put(req, res));
          })
          .catch(() => {});
        return hit;
      }
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match("./index.html")); // 离线兜底：返回应用壳
    })
  );
});
