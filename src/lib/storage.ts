/* ============================================================
   模糊音克星 · 数据层（localStorage 封装，ESM 移植）
   数据键：wrongBook / mastered / history / settings / reviews / cards
   - reviews：每次作答流水（对错都记），FSRS 记忆模型训练语料
   - cards：每字当前状态（FSRS 调度 + 字级统计）

   与旧版（js/store.js）行为逐行等价：localStorage 键名/合并策略/
   上限裁剪/导出格式完全一致——旧版本地数据与备份文件无缝延续。
   ============================================================ */
import { review as fsrsReview } from "./fsrs.ts";

const PREFIX = "fpf_";
const REVIEW_LIMIT = 30000; // reviews 流水上限，超出丢弃最旧（约 300+ 天的练习量）
const HISTORY_LIMIT = 500; // history 轮次汇总上限
const APP_NAME = "fuzzy-pinyin-fixer";
export const EXPORT_VERSION = 2; // 导出格式版本，未来结构变更时递增

/* ---------- 类型 ---------- */

export type PairName = "in/ing" | "en/eng" | "l/n";

/** 每次作答流水（对错都记，追加式） */
export interface ReviewRecord {
  char: string;
  pair: string;
  ts: number;
  rating: number; // 1=答错 3=答对（对齐 FSRS）
  state: number; // 预留 FSRS 状态：0=new 1=learning 2=review 3=relearning
  elapsedDays: number | null;
  scheduledDays: number | null;
  stability: number | null;
  difficulty: number | null;
  word: string | null;
  correctPy: string | null;
  wrongPy: string | null;
  mode: string | null;
  source: string;
  fromFSRS: boolean;
}

/** 每字当前状态（key = pair:char，跨音对同字独立成卡） */
export interface CardRecord {
  char: string;
  pair: string;
  state: number;
  stability: number | null;
  difficulty: number | null;
  due: number | null;
  scheduledDays: number | null;
  reps: number;
  correctCount: number;
  wrongCount: number;
  firstTs: number;
  lastTs: number;
  lastRating: number;
}

export interface WrongItem {
  char: string;
  pair: string;
  wrongPy: string;
  correctPy: string;
  word: string;
  count: number;
  streak: number;
  lastTime: number;
  /** 已掌握标记导致的失效（隐藏但保留，撤回已掌握时恢复） */
  hidden?: boolean;
}

export interface MasteredItem {
  char: string;
  pair: string;
  time: number;
}

export interface HistoryRecord {
  date?: number;
  mode: string;
  pair: string | null;
  total: number;
  correct: number;
  durationSec?: number;
}

export interface Settings {
  defaultCount?: number | "infinite";
  enableFSRS?: boolean;
  ttsEnabled?: boolean;
  /** 设备级（不随数据同步） */
  syncKey?: string;
  syncServer?: string;
  enableSync?: boolean;
  [k: string]: unknown;
}

export interface ExportBundle {
  app: string;
  version: number;
  exportedAt: string;
  data: {
    reviews: ReviewRecord[];
    cards: Record<string, CardRecord>;
    wrongBook: Record<string, WrongItem>;
    mastered: Record<string, MasteredItem>;
    history: HistoryRecord[];
    settings: Settings;
  };
}

/* ---------- localStorage（惰性取 globalThis，浏览器/Node 测试均可注入） ---------- */

function ls(): Storage {
  const g = globalThis as { localStorage?: Storage };
  return g.localStorage as Storage;
}

/* ---------- 数据变更打点（自动云同步接入点） ---------- */

let dirtyListener: (() => void) | null = null;

/** 注册数据变更回调（sync 模块用；重复注册后者覆盖前者） */
export function setDirtyListener(fn: (() => void) | null): void {
  dirtyListener = fn;
}

/* ---------- 导入导出辅助（内部） ---------- */

type Dict = Record<string, Record<string, unknown>>;

// 校验导出结构；返回 {ok, error}
function validateExport(obj: unknown): { ok: boolean; error?: string } {
  if (!obj || typeof obj !== "object") return { ok: false, error: "备份内容为空或格式错误" };
  const o = obj as { app?: string; version?: number; data?: unknown };
  if (o.app && o.app !== APP_NAME) return { ok: false, error: "不是「模糊音克星」的备份文件" };
  if (typeof o.version !== "number" || o.version > EXPORT_VERSION) {
    return { ok: false, error: `备份版本过高（v${o.version}），请升级应用后导入` };
  }
  if (!o.data || typeof o.data !== "object") return { ok: false, error: "备份缺少 data 数据段" };
  return { ok: true };
}

// reviews 条目宽松校验（容忍个别脏数据，只跳过不整体拒绝）
function isReview(r: unknown): r is ReviewRecord {
  return (
    !!r &&
    typeof r === "object" &&
    typeof (r as ReviewRecord).char === "string" &&
    typeof (r as ReviewRecord).pair === "string" &&
    typeof (r as ReviewRecord).ts === "number"
  );
}

// reviews：按 (char, pair, ts) 去重合并，按 ts 升序，超限丢最旧
function mergeReviews(a: ReviewRecord[], b: ReviewRecord[]): { list: ReviewRecord[]; added: number } {
  const map = new Map<string, ReviewRecord>();
  a.forEach((r) => {
    if (isReview(r)) map.set(r.char + "\u0000" + r.pair + "\u0000" + r.ts, r);
  });
  let added = 0;
  b.forEach((r) => {
    if (!isReview(r)) return;
    const key = r.char + "\u0000" + r.pair + "\u0000" + r.ts;
    if (!map.has(key)) {
      map.set(key, r);
      added += 1;
    }
  });
  const list = Array.from(map.values()).sort((x, y) => x.ts - y.ts);
  if (list.length > REVIEW_LIMIT) list.splice(0, list.length - REVIEW_LIMIT);
  return { list, added };
}

// 按 key 合并对象表；同 key 冲突取 timeKey 较新者（整卡替换，保留 FSRS 等扩展字段）
// keepLocalFields：替换时若本地有此字段而远端缺失，保留本地值（如 wrongBook.hidden）
function mergeByNewer(
  local: Dict,
  remote: Dict,
  timeKey: string,
  keepLocalFields?: string[],
): { obj: Dict; added: number } {
  const out: Dict = Object.assign({}, local);
  let added = 0;
  for (const k of Object.keys(remote)) {
    const rv = remote[k];
    if (!rv || typeof rv !== "object") continue;
    if (!out[k]) {
      out[k] = rv;
      added += 1;
    } else if (((out[k][timeKey] as number) || 0) < ((rv[timeKey] as number) || 0)) {
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
function dedupHistory(a: HistoryRecord[], b: HistoryRecord[]): { list: HistoryRecord[]; added: number } {
  const seen = new Set<string>();
  a.forEach((h) => {
    try {
      seen.add(JSON.stringify(h));
    } catch {
      /* ignore */
    }
  });
  const out = a.slice();
  let added = 0;
  b.forEach((h) => {
    if (!h || typeof h !== "object") return;
    let key: string;
    try {
      key = JSON.stringify(h);
    } catch {
      return;
    }
    if (!seen.has(key)) {
      seen.add(key);
      out.push(h);
      added += 1;
    }
  });
  if (out.length > HISTORY_LIMIT) out.splice(0, out.length - HISTORY_LIMIT);
  return { list: out, added };
}

/* ---------- recordAnswer 输入 ---------- */

export interface AnswerInput {
  char: string;
  pair: string;
  rating: number; // 1=答错 3=答对
  ts?: number;
  word?: string | null;
  correctPy?: string | null;
  wrongPy?: string | null;
  mode?: string | null;
  source?: string;
  fromFSRS?: boolean;
}

/* ---------- 数据层单例 ---------- */

export const store = {
  /** 数据写入是否抑制自动同步打点（导入合并/同步拉取期间使用，防循环推送） */
  _suppressDirty: false,

  get<T>(key: string, def: T): T {
    try {
      const raw = ls().getItem(PREFIX + key);
      return raw === null ? def : (JSON.parse(raw) as T);
    } catch {
      return def;
    }
  },

  set(key: string, val: unknown): void {
    try {
      ls().setItem(PREFIX + key, JSON.stringify(val));
    } catch (e) {
      console.warn("localStorage 写入失败:", e);
    }
    // 数据变更打点：触发自动云同步（导入/拉取合并期间抑制，防止循环推送）
    if (!this._suppressDirty && dirtyListener) {
      dirtyListener();
    }
  },

  /** 在抑制打点的上下文中执行写入（如 importData 合并、同步拉取），返回 fn 结果 */
  _withSuppress<R>(fn: () => R): R {
    const prev = this._suppressDirty;
    this._suppressDirty = true;
    try {
      return fn();
    } finally {
      this._suppressDirty = prev;
    }
  },

  /* ---------- settings ---------- */
  getSettings(): Required<Pick<Settings, "defaultCount" | "enableFSRS" | "ttsEnabled">> & Settings {
    return Object.assign({ defaultCount: 10, enableFSRS: true, ttsEnabled: true }, this.get<Settings>("settings", {}));
  },
  setSettings(patch: Settings): void {
    // 只写 patch 本身，不展开默认值——避免把默认 defaultCount/enableFSRS 误持久化，
    // 导致"本地无 settings 记录"的判断永远不成立（影响导入/同步的设置合并）
    const cur = this.get<Settings>("settings", {});
    this.set("settings", Object.assign({}, cur, patch));
  },

  /* ---------- mastered：按字标记 {char: {char, pair, time}} ---------- */
  getMastered(): Record<string, MasteredItem> {
    return this.get("mastered", {});
  },
  isMastered(char: string): boolean {
    return !!this.getMastered()[char];
  },
  addMastered(char: string, pair: string): void {
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
  removeMastered(char: string): void {
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

  /* ---------- wrongBook：去重累积 ---------- */
  getWrongBook(): Record<string, WrongItem> {
    return this.get("wrongBook", {});
  },
  addWrong(rec: { char: string; pair: string; wrongPy: string; correctPy: string; word: string }): void {
    const wb = this.getWrongBook();
    if (wb[rec.char]) {
      wb[rec.char].count += 1;
      wb[rec.char].streak = 0; // 出错重置连续答对
      wb[rec.char].lastTime = Date.now();
      wb[rec.char].wrongPy = rec.wrongPy;
    } else {
      wb[rec.char] = {
        char: rec.char,
        pair: rec.pair,
        wrongPy: rec.wrongPy,
        correctPy: rec.correctPy,
        word: rec.word,
        count: 1,
        streak: 0,
        lastTime: Date.now(),
      };
    }
    this.set("wrongBook", wb);
  },
  /** 错题重练答对：streak+1，连续答对 2 次自动移出 */
  markWrongCorrect(char: string): void {
    const wb = this.getWrongBook();
    const item = wb[char];
    if (!item) return;
    item.streak = (item.streak || 0) + 1;
    if (item.streak >= 2) {
      delete wb[char];
    }
    this.set("wrongBook", wb);
  },
  removeWrong(char: string): void {
    const wb = this.getWrongBook();
    if (wb[char]) {
      delete wb[char];
      this.set("wrongBook", wb);
    }
  },

  /* ---------- history：每轮记录 ---------- */
  getHistory(): HistoryRecord[] {
    return this.get("history", []);
  },
  addHistory(rec: HistoryRecord): void {
    const h = this.getHistory();
    h.push(Object.assign({ date: Date.now() }, rec));
    // 只保留最近 HISTORY_LIMIT 条
    if (h.length > HISTORY_LIMIT) h.splice(0, h.length - HISTORY_LIMIT);
    this.set("history", h);
  },

  /* ---------- reviews：每次作答流水 ---------- */
  getReviews(): ReviewRecord[] {
    return this.get("reviews", []);
  },

  /** 记录一次作答：追加流水 + 同步字卡聚合状态（cards，含 FSRS 调度） */
  recordAnswer(rec: AnswerInput): void {
    const now = rec.ts || Date.now();
    const reviews = this.getReviews();
    // 计算 elapsedDays：找该字上一条作答记录
    let elapsedDays: number | null = null;
    for (let i = reviews.length - 1; i >= 0; i--) {
      if (reviews[i].char === rec.char && reviews[i].pair === rec.pair) {
        elapsedDays = Math.round(((now - reviews[i].ts) / 86400000) * 100) / 100;
        break;
      }
    }
    const review: ReviewRecord = {
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
    const card: CardRecord =
      cards[key] ||
      {
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
    // FSRS 调度：开关开启时用当前参数更新记忆状态与下次到期时间
    if (this.getSettings().enableFSRS) {
      const fs = fsrsReview(card, review.rating, now);
      card.state = fs.state;
      card.stability = fs.stability;
      card.difficulty = fs.difficulty;
      card.due = fs.due;
      card.scheduledDays = fs.scheduledDays;
    }
    cards[key] = card;
    this.set("cards", cards);
  },

  /* ---------- cards：每字当前状态 ---------- */
  getCards(): Record<string, CardRecord> {
    return this.get("cards", {});
  },

  /** FSRS 到期复习队列：返回 due <= now 的卡片 {key, char, pair, due}，按到期时间升序 */
  getDueKeys(now?: number, limit?: number): { key: string; char: string; pair: string; due: number }[] {
    now = now || Date.now();
    const out: { key: string; char: string; pair: string; due: number }[] = [];
    const cards = this.getCards();
    for (const key of Object.keys(cards)) {
      const c = cards[key];
      if (c && c.due && c.due <= now) out.push({ key, char: c.char, pair: c.pair, due: c.due });
    }
    out.sort((a, b) => a.due - b.due);
    return limit ? out.slice(0, limit) : out;
  },

  /* ---------- 导出 / 导入（多端同步地基） ---------- */

  /** 导出全部数据为版本化对象（UI 层负责下载为文件；云同步用）
      注：settings 会剥离同步配置字段（syncKey/syncServer/enableSync）——
      密钥与开关属于"设备级"配置，各设备独立，不随业务数据外传 */
  exportData(): ExportBundle {
    const settings = Object.assign({}, this.getSettings()) as Record<string, unknown>;
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
        settings: settings as Settings,
      },
    };
  },

  /** 导入并双向合并（不覆盖）：接受 JSON 字符串或已解析对象
      返回 {ok:true, merged:{reviews,cards,wrongBook,mastered,history}} | {ok:false, error} */
  importData(json: string | Partial<ExportBundle> | Record<string, unknown>):
    | { ok: true; merged: { reviews: number; cards: number; wrongBook: number; mastered: number; history: number } }
    | { ok: false; error: string } {
    let obj: unknown = json;
    if (typeof json === "string") {
      try {
        obj = JSON.parse(json);
      } catch {
        return { ok: false, error: "文件不是有效的 JSON" };
      }
    }
    const v = validateExport(obj);
    if (!v.ok) return { ok: false, error: v.error! };
    const d = (obj as ExportBundle).data ?? {};

    // reviews 流水：去重合并
    const rv = mergeReviews(this.getReviews(), Array.isArray(d.reviews) ? d.reviews : []);
    // 对象表：按 key 合并、同 key 取较新（wrongBook 替换时保护本地 hidden 标记）
    const cd = mergeByNewer(
      this.getCards() as unknown as Dict,
      (d.cards && typeof d.cards === "object" ? d.cards : {}) as unknown as Dict,
      "lastTs",
    );
    const wb = mergeByNewer(
      this.getWrongBook() as unknown as Dict,
      (d.wrongBook && typeof d.wrongBook === "object" ? d.wrongBook : {}) as unknown as Dict,
      "lastTime",
      ["hidden"],
    );
    const ms = mergeByNewer(
      this.getMastered() as unknown as Dict,
      (d.mastered && typeof d.mastered === "object" ? d.mastered : {}) as unknown as Dict,
      "time",
    );
    // history：去重
    const hs = dedupHistory(this.getHistory(), Array.isArray(d.history) ? d.history : []);
    // settings：本地有显式记录则本地优先（不覆盖当前偏好），否则采用远端（换设备/清空后恢复）
    // 注：不能用 getSettings() 判断——它总返回含默认值的对象，会误伤首次导入
    const localSettingsRaw = this.get<Settings | null>("settings", null);
    const remoteSettings = d.settings && typeof d.settings === "object" ? d.settings : {};
    const st = localSettingsRaw === null ? Object.assign({}, remoteSettings) : Object.assign({}, remoteSettings, localSettingsRaw);

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

  clearAll(): void {
    ["wrongBook", "mastered", "history", "settings", "reviews", "cards"].forEach((k) =>
      ls().removeItem(PREFIX + k),
    );
  },
};
