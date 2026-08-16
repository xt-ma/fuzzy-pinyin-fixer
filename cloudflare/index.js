/* ============================================================
   模糊音克星 · Cloudflare Worker 同步服务
   API：
     GET    /api/sync  → {ok, data, updatedAt}   拉取云端数据
     PUT    /api/sync  → {ok, updatedAt}          推送合并后数据（幂等覆盖本空间）
     DELETE /api/sync  → {ok}                     重置空间（配合"重置密钥"）
   认证：X-Sync-Key 请求头（应用生成的 32 字节密钥，格式 fpf-xxx）
   安全：密钥正则白名单（防 KV key 注入）、Body ≤2MB、单空间 ≤5MB、
         内存限流（IP+密钥 30 次/分）、CSP 响应头
   部署：wrangler.toml 绑定 KV 命名空间（变量名 FPF_SYNC）
   ============================================================ */

const KEY_RE = /^fpf-[A-Za-z0-9_-]{40,}$/;
const BODY_LIMIT = 2 * 1024 * 1024; // 2MB
const SPACE_LIMIT = 5 * 1024 * 1024; // 5MB
const RATE_LIMIT = 30; // 每分钟
const RATE_WINDOW_MS = 60000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Sync-Key",
  "Access-Control-Max-Age": "86400",
  "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};

/* 内存限流（Worker isolate 级；个人应用足够，生产可换 Durable Objects / Rate Limiting） */
const rateBuckets = new Map();
function rateLimit(id) {
  const now = Date.now();
  const b = rateBuckets.get(id);
  if (!b || now - b.start > RATE_WINDOW_MS) {
    rateBuckets.set(id, { start: now, count: 1 });
    // 防止 Map 无限增长
    if (rateBuckets.size > 10000) {
      for (const [k, v] of rateBuckets) {
        if (now - v.start > RATE_WINDOW_MS) rateBuckets.delete(k);
      }
    }
    return true;
  }
  b.count += 1;
  return b.count <= RATE_LIMIT;
}

function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, CORS_HEADERS, extraHeaders || {}),
  });
}

export default {
  async fetch(request, env) {
    // 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (url.pathname !== "/api/sync") {
      return json({ ok: false, error: "not found" }, 404);
    }
    const key = request.headers.get("X-Sync-Key") || "";
    if (!KEY_RE.test(key)) {
      return json({ ok: false, error: "invalid key" }, 400);
    }
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!rateLimit(ip + ":" + key)) {
      return json({ ok: false, error: "rate limited" }, 429);
    }
    const storageKey = "space:" + key;

    switch (request.method) {
      case "GET": {
        const raw = await env.FPF_SYNC.get(storageKey);
        if (!raw) return json({ ok: true, data: null, updatedAt: null });
        const record = JSON.parse(raw);
        return json({ ok: true, data: record.data, updatedAt: record.updatedAt });
      }
      case "PUT": {
        const cl = Number(request.headers.get("Content-Length") || 0);
        if (cl > BODY_LIMIT) return json({ ok: false, error: "payload too large" }, 413);
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return json({ ok: false, error: "bad json" }, 400);
        }
        if (!body || typeof body !== "object" || !body.data || typeof body.data !== "object") {
          return json({ ok: false, error: "bad payload" }, 400);
        }
        const size = JSON.stringify(body).length;
        if (size > SPACE_LIMIT) return json({ ok: false, error: "space too large" }, 413);
        const record = {
          data: body.data,
          clientId: body.clientId || null,
          mergedAt: body.mergedAt || null,
          updatedAt: Date.now(),
        };
        await env.FPF_SYNC.put(storageKey, JSON.stringify(record));
        return json({ ok: true, updatedAt: record.updatedAt });
      }
      case "DELETE": {
        await env.FPF_SYNC.delete(storageKey);
        return json({ ok: true });
      }
      default:
        return json({ ok: false, error: "method not allowed" }, 405);
    }
  },
};
