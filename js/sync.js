/* ============================================================
   模糊音克星 · 自动云同步模块（Cloudflare Workers + KV）
   设计（详见 docs/sync-plan.md Phase 2）：
   - 自动同步：启动拉取 → 数据变更防抖 3s 推送 → 页面关闭 flush → 失败指数退避重试
   - 密钥即身份：应用生成 32 字节密钥（fpf- 前缀），存设备本地，X-Sync-Key 头携带
   - 同步内容 = Store.exportData()（剥离设备级同步配置）；拉取 = Store.importData() 双向合并
   - 设置项（设备级，不参与同步）：settings.enableSync / syncKey / syncServer
   依赖：js/store.js（加载顺序在 sync.js 之前）
   ============================================================ */
(function () {
  "use strict";

  const PUSH_DEBOUNCE_MS = 3000; // 数据变更后防抖推送
  const RETRY_BASE_MS = 5000; // 失败重试初始间隔（指数退避）
  const RETRY_MAX_MS = 300000; // 重试上限 5 分钟
  const META_KEY = "fpf_syncMeta";

  const Sync = {
    /* ---------------- 配置（设备级，不随数据同步） ---------------- */
    enabled() {
      return !!Store.getSettings().enableSync;
    },
    server() {
      return String(Store.getSettings().syncServer || "").replace(/\/+$/, "");
    },
    key() {
      return String(Store.getSettings().syncKey || "");
    },

    /* ---------------- 密钥 ---------------- */
    /* 生成 32 字节随机密钥（fpf- + base64url，32 字节 → 43 字符） */
    generateKey() {
      const bytes = new Uint8Array(32);
      if (globalThis.crypto && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
      let s = "";
      for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const n = (b0 << 16) | (b1 << 8) | b2;
        s += CHARS[(n >> 18) & 63] + CHARS[(n >> 12) & 63] + CHARS[(n >> 6) & 63] + CHARS[n & 63];
      }
      return "fpf-" + s.slice(0, 43); // 32 字节 → 43 字符（舍掉 padding 位）
    },
    /* 密钥格式是否合法（与 Worker 端正则一致） */
    isValidKey(k) {
      return /^fpf-[A-Za-z0-9_-]{40,}$/.test(k || "");
    },

    /* ---------------- 内部状态 ---------------- */
    _dirty: false, // 有待推送的本地变更
    _pushing: false, // 推送进行中（防重入）
    _timer: null, // 防抖定时器
    _retryDelay: RETRY_BASE_MS, // 当前重试间隔
    _retryTimer: null, // 重试定时器
    _lastSyncAt: null, // 最近一次成功同步时间
    _lastError: null, // 最近一次错误信息
    _onSync: null, // 同步状态变更通知（UI 刷新）

    /* 注册同步状态变更回调（push/pull 完成后触发，供 UI 刷新） */
    setOnSync(fn) {
      this._onSync = fn;
    },
    _notify() {
      if (this._onSync) {
        try { this._onSync(); } catch (e) { /* ignore */ }
      }
    },

    _meta() {
      try {
        const raw = localStorage.getItem(META_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch (e) {
        return {};
      }
    },
    _setMeta(patch) {
      const m = Object.assign(this._meta(), patch);
      localStorage.setItem(META_KEY, JSON.stringify(m));
    },
    clientId() {
      let m = this._meta();
      if (!m.clientId) {
        m.clientId = "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        this._setMeta({ clientId: m.clientId });
      }
      return m.clientId;
    },

    /* ---------------- 状态查询（UI 用） ---------------- */
    status() {
      return {
        enabled: this.enabled(),
        key: this.key(),
        server: this.server(),
        lastSyncAt: this._meta().lastSyncAt || null,
        pending: this._dirty,
        error: this._lastError,
      };
    },

    /* ---------------- 打点：数据变更 → 自动推送 ---------------- */
    markDirty() {
      if (!this.enabled() || !this.key() || !this.server()) return;
      this._dirty = true;
      this._lastError = null;
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.push(), PUSH_DEBOUNCE_MS);
    },

    /* ---------------- 推送（PUT：合并后全量覆盖本空间，幂等） ---------------- */
    async push(force) {
      if (!force && (!this.enabled() || !this.key() || !this.server())) return false;
      if (this._pushing) return false;
      this._pushing = true;
      clearTimeout(this._retryTimer);
      try {
        const res = await fetch(this.server() + "/api/sync", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Sync-Key": this.key(),
          },
          body: JSON.stringify({
            data: Store.exportData(),
            clientId: this.clientId(),
            mergedAt: Date.now(),
          }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const body = await res.json().catch(() => ({}));
        this._dirty = false;
        this._retryDelay = RETRY_BASE_MS;
        this._lastError = null;
        this._setMeta({ lastSyncAt: body.updatedAt || Date.now() });
        this._notify();
        return true;
      } catch (e) {
        this._lastError = e.message || String(e);
        this._dirty = true; // 保留脏标记
        // 指数退避重试
        this._retryTimer = setTimeout(() => this.push(), this._retryDelay);
        this._retryDelay = Math.min(this._retryDelay * 2, RETRY_MAX_MS);
        this._notify();
        return false;
      } finally {
        this._pushing = false;
      }
    },

    /* ---------------- 拉取（GET：云端并入本地，双向合并） ---------------- */
    async pull(force) {
      if (!force && (!this.enabled() || !this.key() || !this.server())) return false;
      try {
        const res = await fetch(this.server() + "/api/sync", {
          method: "GET",
          headers: { "X-Sync-Key": this.key() },
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const body = await res.json().catch(() => ({}));
        if (body.ok) {
          // 双向合并（抑制内部打点），并始终回推一次（幂等）：空空间也把本地数据推上去
          if (body.data) Store.importData(body.data);
          await this.push(force);
        }
        // 请求成功即记录上次同步（空空间无数据也视为一次成功同步）
        this._setMeta({ lastSyncAt: body.updatedAt || Date.now() });
        this._lastError = null;
        this._notify();
        return true;
      } catch (e) {
        this._lastError = e.message || String(e);
        this._notify();
        return false;
      }
    },

    /* ---------------- 手动立即同步（拉取合并 + 回推，不依赖自动同步开关） ---------------- */
    async syncNow() {
      return this.pull(true);
    },

    /* ---------------- 立即 flush（页面关闭/隐藏时尽力推送） ---------------- */
    flush() {
      if (this._dirty) this.push();
    },

    /* ---------------- 重置空间（配合"重置密钥"） ---------------- */
    async resetSpace() {
      if (!this.server() || !this.key()) return false;
      try {
        await fetch(this.server() + "/api/sync", {
          method: "DELETE",
          headers: { "X-Sync-Key": this.key() },
        });
        return true;
      } catch (e) {
        this._lastError = e.message || String(e);
        return false;
      }
    },

    /* ---------------- 启动：绑定事件 + 静默拉取 ---------------- */
    init() {
      // 事件只绑一次（开关可能多次触发 init）
      if (!this._bound) {
        this._bound = true;
        if (typeof document !== "undefined") {
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") this.flush();
          });
        }
        if (typeof window !== "undefined") {
          window.addEventListener("beforeunload", () => this.flush());
          window.addEventListener("online", () => {
            if (this._dirty) this.push();
          });
        }
      }
      // 启动静默拉取（异步，不阻塞）
      if (this.enabled() && this.key() && this.server()) {
        setTimeout(() => this.pull(), 0);
      }
    },
  };

  window.Sync = Sync;
})();
