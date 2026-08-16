/* ============================================================
   模糊音克星 · 数据层（localStorage 封装）
   数据键：wrongBook / mastered / history / settings / reviews / cards
   - reviews：每次作答流水（对错都记），FSRS 记忆模型训练语料
   - cards：每字当前状态（FSRS 调度预留 + 字级统计）
   ============================================================ */
(function () {
  "use strict";

  const PREFIX = "fpf_";
  const REVIEW_LIMIT = 30000; // reviews 流水上限，超出丢弃最旧（约 300+ 天的练习量）
  const HISTORY_LIMIT = 500; // history 轮次汇总上限
  const APP_NAME = "fuzzy-pinyin-fixer";
  const EXPORT_VERSION = 2; // 导出格式版本，未来结构变更时递增

  /* ---------- 导入导出辅助（内部） ---------- */

  // 校验导出结构；返回 {ok, error}
  function validateExport(obj) {
    if (!obj || typeof obj !== "object") return { ok: false, error: "备份内容为空或格式错误" };
    if (obj.app && obj.app !== APP_NAME) return { ok: false, error: "不是「模糊音克星」的备份文件" };
    if (typeof obj.version !== "number" || obj.version > EXPORT_VERSION) {
      return { ok: false, error: "备份版本过高（v" + obj.version + "），请升级应用后导入" };
    }
    if (!obj.data || typeof obj.data !== "object") return { ok: false, error: "备份缺少 data 数据段" };
    return { ok: true };
  }

  // reviews 条目宽松校验（容忍个别脏数据，只跳过不整体拒绝）
  function isReview(r) {
    return !!r && typeof r === "object" && typeof r.char === "string" && typeof r.pair === "string" && typeof r.ts === "number";
  }

  // reviews：按 (char, pair, ts) 去重合并，按 ts 升序，超限丢最旧
  function mergeReviews(a, b) {
    const map = new Map();
    a.forEach((r) => { if (isReview(r)) map.set(r.char + "\u0000" + r.pair + "\u0000" + r.ts, r); });
    let added = 0;
    b.forEach((r) => {
      if (!isReview(r)) return;
      const key = r.char + "\u0000" + r.pair + "\u0000" + r.ts;
      if (!map.has(key)) { map.set(key, r); added += 1; }
    });
    const list = Array.from(map.values()).sort((x, y) => x.ts - y.ts);
    if (list.length > REVIEW_LIMIT) list.splice(0, list.length - REVIEW_LIMIT);
    return { list, added };
  }

  // 按 key 合并对象表；同 key 冲突取 timeKey 较新者（整卡替换，保留 FSRS 等扩展字段）
  // keepLocalFields：替换时若本地有此字段而远端缺失，保留本地值（如 wrongBook.hidden）
  function mergeByNewer(local, remote, timeKey, keepLocalFields) {
    const out = Object.assign({}, local);
    let added = 0;
    for (const k of Object.keys(remote)) {
      const rv = remote[k];
      if (!rv || typeof rv !== "object") continue;
      if (!out[k]) { out[k] = rv; added += 1; }
      else if ((out[k][timeKey] || 0) < (rv[timeKey] || 0)) {
        const merged = Object.assign({}, rv);
        (keepLocalFields || []).forEach((f) => {
          if (out[k][f] !== undefined && merged[f] === undefined) merged[f] = out[k][f];
        });
        out[k] = merged;
        added += 1;
      }
    }
    return { obj: out, added };
  }

  // history：整条序列化去重，超限丢最旧
  function dedupHistory(a, b) {
    const seen = new Set();
    a.forEach((h) => { try { seen.add(JSON.stringify(h)); } catch (e) { /* ignore */ } });
    const out = a.slice();
    let added = 0;
    b.forEach((h) => {
      if (!h || typeof h !== "object") return;
      let key;
      try { key = JSON.stringify(h); } catch (e) { return; }
      if (!seen.has(key)) { seen.add(key); out.push(h); added += 1; }
    });
    if (out.length > HISTORY_LIMIT) out.splice(0, out.length - HISTORY_LIMIT);
    return { list: out, added };
  }

  const Store = {
    /* 数据写入是否抑制自动同步打点（导入合并/同步拉取期间使用，防循环推送） */
    _suppressDirty: false,
    get(key, def) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? def : JSON.parse(raw);
      } catch (e) {
        return def;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(val));
      } catch (e) {
        console.warn("localStorage 写入失败:", e);
      }
      // 数据变更打点：触发自动云同步（导入/拉取合并期间抑制，防止循环推送）
      if (!this._suppressDirty && window.Sync && window.Sync.markDirty) {
        window.Sync.markDirty();
      }
    },
    /* 在抑制打点的上下文中执行写入（如 importData 合并、同步拉取），返回 fn 结果 */
    _withSuppress(fn) {
      const prev = this._suppressDirty;
      this._suppressDirty = true;
      try {
        return fn();
      } finally {
        this._suppressDirty = prev;
      }
    },
    /* ---------- settings ---------- */
    getSettings() {
      return Object.assign({ defaultCount: 10, enableFSRS: true }, this.get("settings", {}));
    },
    setSettings(patch) {
      // 只写 patch 本身，不展开默认值——避免把默认 defaultCount/enableFSRS 误持久化，
      // 导致"本地无 settings 记录"的判断永远不成立（影响导入/同步的设置合并）
      const cur = this.get("settings", {});
      this.set("settings", Object.assign({}, cur, patch));
    },
    /* ---------- mastered：按字标记 {char: {char, pair, time}} ---------- */
    getMastered() {
      return this.get("mastered", {});
    },
    isMastered(char) {
      return !!this.getMastered()[char];
    },
    addMastered(char, pair) {
      const m = this.getMastered();
      if (!m[char]) m[char] = { char, pair, time: Date.now() };
      this.set("mastered", m);
      // 联动错题本：该字错题记录置为失效（隐藏但保留，撤回已掌握时恢复）
      const wb = this.getWrongBook();
      if (wb[char] && !wb[char].hidden) {
        wb[char].hidden = true;
        this.set("wrongBook", wb);
      }
    },
    removeMastered(char) {
      const m = this.getMastered();
      if (m[char]) {
        delete m[char];
        this.set("mastered", m);
      }
      // 撤回已掌握 → 错题本记录恢复可见
      const wb = this.getWrongBook();
      if (wb[char] && wb[char].hidden) {
        wb[char].hidden = false;
        this.set("wrongBook", wb);
      }
    },
    /* ---------- wrongBook：去重累积 {char: {char, pair, wrongPy, correctPy, word, count, streak, lastTime}} ---------- */
    getWrongBook() {
      return this.get("wrongBook", {});
    },
    addWrong(rec) {
      const wb = this.getWrongBook();
      if (wb[rec.char]) {
        wb[rec.char].count += 1;
        wb[rec.char].streak = 0; // 出错重置连续答对
        wb[rec.char].lastTime = Date.now();
        wb[rec.char].wrongPy = rec.wrongPy;
      } else {
        wb[rec.char] = {
          char: rec.char, pair: rec.pair, wrongPy: rec.wrongPy,
          correctPy: rec.correctPy, word: rec.word,
          count: 1, streak: 0, lastTime: Date.now(),
        };
      }
      this.set("wrongBook", wb);
    },
    /* 错题重练答对：streak+1，连续答对 2 次自动移出 */
    markWrongCorrect(char) {
      const wb = this.getWrongBook();
      const item = wb[char];
      if (!item) return;
      item.streak = (item.streak || 0) + 1;
      if (item.streak >= 2) {
        delete wb[char];
      }
      this.set("wrongBook", wb);
    },
    removeWrong(char) {
      const wb = this.getWrongBook();
      if (wb[char]) {
        delete wb[char];
        this.set("wrongBook", wb);
      }
    },
    /* ---------- history：每轮记录 ---------- */
    getHistory() {
      return this.get("history", []);
    },
    addHistory(rec) {
      const h = this.getHistory();
      h.push(Object.assign({ date: Date.now() }, rec));
      // 只保留最近 500 条
      if (h.length > 500) h.splice(0, h.length - 500);
      this.set("history", h);
    },
    /* ---------- reviews：每次作答流水（对错都记，追加式） ----------
       review = {
         char, pair, ts, rating, state,
         elapsedDays, scheduledDays, stability, difficulty,
         word, correctPy, wrongPy, mode, source
       }
       rating 对齐 FSRS：1=again(答错) 3=good(答对)；预留 2=hard / 4=easy
       elapsedDays：距该字上次作答的天数（FSRS 优化器输入）
       state/stability/difficulty/scheduledDays：FSRS 预留，接入记忆模型后填充
    */
    getReviews() {
      return this.get("reviews", []);
    },
    /* 记录一次作答：追加流水 + 同步字卡聚合状态（cards） */
    recordAnswer(rec) {
      const now = rec.ts || Date.now();
      const reviews = this.getReviews();
      // 计算 elapsedDays：找该字上一条作答记录
      let elapsedDays = null;
      for (let i = reviews.length - 1; i >= 0; i--) {
        if (reviews[i].char === rec.char && reviews[i].pair === rec.pair) {
          elapsedDays = Math.round(((now - reviews[i].ts) / 86400000) * 100) / 100;
          break;
        }
      }
      const review = {
        char: rec.char,
        pair: rec.pair,
        ts: now,
        rating: rec.rating, // 1=答错 3=答对
        state: 0, // 预留 FSRS 状态：0=new 1=learning 2=review 3=relearning
        elapsedDays,
        scheduledDays: null, // 预留：FSRS 计划间隔
        stability: null, // 预留：FSRS 稳定性
        difficulty: null, // 预留：FSRS 难度 (1-10)
        word: rec.word || null,
        correctPy: rec.correctPy || null,
        wrongPy: rec.wrongPy || null,
        mode: rec.mode || null,
        source: rec.source || "normal",
        fromFSRS: !!rec.fromFSRS, // 是否来自 FSRS 到期复习队列
      };
      reviews.push(review);
      if (reviews.length > REVIEW_LIMIT) reviews.splice(0, reviews.length - REVIEW_LIMIT);
      this.set("reviews", reviews);

      // 字卡聚合状态（key = pair:char，跨音对同字独立成卡）
      const cards = this.getCards();
      const key = rec.pair + ":" + rec.char;
      const card = cards[key] || {
        char: rec.char,
        pair: rec.pair,
        state: 0,
        stability: null,
        difficulty: null,
        due: null, // 预留：下次到期时间
        scheduledDays: null,
        reps: 0,
        correctCount: 0,
        wrongCount: 0,
        firstTs: now,
        lastTs: now,
        lastRating: review.rating,
      };
      card.reps += 1;
      if (review.rating >= 3) card.correctCount += 1;
      else card.wrongCount += 1;
      card.lastTs = now;
      card.lastRating = review.rating;
      // FSRS 调度：开关开启时用当前参数（默认或已训练）更新记忆状态与下次到期时间
      if (this.getSettings().enableFSRS && window.FSRS) {
        const fs = window.FSRS.review(card, review.rating, now);
        card.state = fs.state;
        card.stability = fs.stability;
        card.difficulty = fs.difficulty;
        card.due = fs.due;
        card.scheduledDays = fs.scheduledDays;
      }
      cards[key] = card;
      this.set("cards", cards);
    },
    /* ---------- cards：每字当前状态 {key: {char, pair, state, stability, difficulty, due, scheduledDays, reps, correctCount, wrongCount, firstTs, lastTs, lastRating}} ---------- */
    getCards() {
      return this.get("cards", {});
    },
    /* FSRS 到期复习队列：返回 due <= now 的卡片 {key, char, pair, due}，按到期时间升序 */
    getDueKeys(now, limit) {
      now = now || Date.now();
      const out = [];
      const cards = this.getCards();
      for (const key of Object.keys(cards)) {
        const c = cards[key];
        if (c && c.due && c.due <= now) out.push({ key, char: c.char, pair: c.pair, due: c.due });
      }
      out.sort((a, b) => a.due - b.due);
      return limit ? out.slice(0, limit) : out;
    },
    /* ---------- 导出 / 导入（多端同步地基） ---------- */
    EXPORT_VERSION,
    /* 导出全部数据为版本化对象（UI 层负责下载为文件；云同步用）
       注：settings 会剥离同步配置字段（syncKey/syncServer/enableSync）——
       密钥与开关属于"设备级"配置，各设备独立，不随业务数据外传 */
    exportData() {
      const settings = Object.assign({}, this.getSettings());
      delete settings.syncKey;
      delete settings.syncServer;
      delete settings.enableSync;
      return {
        app: APP_NAME,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        data: {
          reviews: this.getReviews(),
          cards: this.getCards(),
          wrongBook: this.getWrongBook(),
          mastered: this.getMastered(),
          history: this.getHistory(),
          settings,
        },
      };
    },
    /* 导入并双向合并（不覆盖）：接受 JSON 字符串或已解析对象
       返回 {ok:true, merged:{reviews,cards,wrongBook,mastered,history,settings}} | {ok:false, error} */
    importData(json) {
      let obj = json;
      if (typeof json === "string") {
        try { obj = JSON.parse(json); } catch (e) { return { ok: false, error: "文件不是有效的 JSON" }; }
      }
      const v = validateExport(obj);
      if (!v.ok) return { ok: false, error: v.error };
      const d = obj.data;

      // reviews 流水：去重合并
      const rv = mergeReviews(this.getReviews(), Array.isArray(d.reviews) ? d.reviews : []);
      // 对象表：按 key 合并、同 key 取较新（wrongBook 替换时保护本地 hidden 标记）
      const cd = mergeByNewer(this.getCards(), d.cards && typeof d.cards === "object" ? d.cards : {}, "lastTs");
      const wb = mergeByNewer(this.getWrongBook(), d.wrongBook && typeof d.wrongBook === "object" ? d.wrongBook : {}, "lastTime", ["hidden"]);
      const ms = mergeByNewer(this.getMastered(), d.mastered && typeof d.mastered === "object" ? d.mastered : {}, "time");
      // history：去重
      const hs = dedupHistory(this.getHistory(), Array.isArray(d.history) ? d.history : []);
      // settings：本地有显式记录则本地优先（不覆盖当前偏好），否则采用远端（换设备/清空后恢复）
      // 注：不能用 getSettings() 判断——它总返回含默认值的对象，会误伤首次导入
      const localSettingsRaw = this.get("settings", null);
      const remoteSettings = d.settings && typeof d.settings === "object" ? d.settings : {};
      const st = localSettingsRaw === null
        ? Object.assign({}, remoteSettings)
        : Object.assign({}, remoteSettings, localSettingsRaw);

      // 合并写回（抑制打点：这是同步/导入路径，不应触发自动推送）
      this._withSuppress(() => {
        this.set("reviews", rv.list);
        this.set("cards", cd.obj);
        this.set("wrongBook", wb.obj);
        this.set("mastered", ms.obj);
        this.set("history", hs.list);
        this.set("settings", st);
      });

      return {
        ok: true,
        merged: {
          reviews: rv.added,
          cards: cd.added,
          wrongBook: wb.added,
          mastered: ms.added,
          history: hs.added,
        },
      };
    },
    clearAll() {
      ["wrongBook", "mastered", "history", "settings", "reviews", "cards"].forEach((k) =>
        localStorage.removeItem(PREFIX + k)
      );
    },
  };

  window.Store = Store;
})();
