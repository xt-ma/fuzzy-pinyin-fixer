/* ============================================================
   模糊音克星 · 统计聚合与格式化（从 js/ui.js / 各视图收敛为纯函数）
   ============================================================ */
import { store, type CardRecord, type HistoryRecord, type MasteredItem, type WrongItem } from "./storage.ts";
import { PAIR_ORDER, pairMeta, readingOf, totalEntries, wordOf } from "./words.ts";

/* ---------------- 时间格式化 ---------------- */

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = pad(d.getHours()) + ":" + pad(d.getMinutes());
  if (sameDay) return "今天 " + hm;
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "昨天 " + hm;
  return pad(d.getMonth() + 1) + "月" + pad(d.getDate()) + "日 " + hm;
}

export function fmtDayLabel(d: Date): string {
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return week[d.getDay()];
}

/* ---------------- 统计计算 ---------------- */

export interface PairStat {
  meta: ReturnType<typeof pairMeta>;
  total: number;
  correct: number;
  rate: number | null;
  masteredCount: number;
}

export interface Stats {
  history: HistoryRecord[];
  total: number;
  correct: number;
  totalRate: number | null;
  dayMap: Record<string, { total: number; correct: number }>;
  dayKeys: string[];
  streak: number;
  pairStats: Record<string, PairStat>;
  mastered: Record<string, MasteredItem>;
  wrongBook: Record<string, WrongItem>;
}

export function statsOf(_rangeDays?: number): Stats {
  const history = store.getHistory();
  const mastered = store.getMastered();
  const wrongBook = store.getWrongBook();
  const all = history;
  const total = all.reduce((s, r) => s + r.total, 0);
  const correct = all.reduce((s, r) => s + r.correct, 0);
  const totalRate = total ? Math.round((correct / total) * 100) : null;

  // 每日聚合
  const dayMap: Record<string, { total: number; correct: number }> = {};
  all.forEach((r) => {
    const key = new Date(r.date || 0).toDateString();
    if (!dayMap[key]) dayMap[key] = { total: 0, correct: 0 };
    dayMap[key].total += r.total;
    dayMap[key].correct += r.correct;
  });
  const dayKeys = Object.keys(dayMap).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // 连续打卡
  let streak = 0;
  const d = new Date();
  if (dayMap[d.toDateString()]) {
    streak = 1;
    for (;;) {
      d.setDate(d.getDate() - 1);
      if (dayMap[d.toDateString()]) streak += 1;
      else break;
    }
  }

  // 各音对
  const pairStats: Record<string, PairStat> = {};
  PAIR_ORDER.forEach((p) => {
    const meta = pairMeta(p);
    const recs = all.filter((r) => r.pair === p);
    const t = recs.reduce((s, r) => s + r.total, 0);
    const c = recs.reduce((s, r) => s + r.correct, 0);
    const masteredCount = Object.values(mastered).filter((m) => m.pair === p).length;
    pairStats[p] = {
      meta,
      total: t,
      correct: c,
      rate: t ? Math.round((c / t) * 100) : null,
      masteredCount,
    };
  });

  return { history, total, correct, totalRate, dayMap, dayKeys, streak, pairStats, mastered, wrongBook };
}

/** 趋势序列（最近 N 天，含今天，无数据显示 null） */
export interface TrendPoint {
  label: string;
  rate: number | null;
  total: number;
}

export function trendSeries(stats: Stats, days: number): TrendPoint[] {
  const out: TrendPoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toDateString();
    const rec = stats.dayMap[key];
    out.push({
      label: fmtDayLabel(d),
      rate: rec ? Math.round((rec.correct / rec.total) * 100) : null,
      total: rec ? rec.total : 0,
    });
  }
  return out;
}

/** 7 天趋势变化：后半段均值 - 前半段均值（无数据显示 null） */
export function trendDelta(stats: Stats, days: number): number | null {
  const series = trendSeries(stats, days);
  const half = Math.floor(days / 2);
  const cur = series.slice(half).filter((s) => s.rate != null);
  const prev = series.slice(0, half).filter((s) => s.rate != null);
  if (!cur.length || !prev.length) return null;
  const avg = (arr: TrendPoint[]) => arr.reduce((s, x) => s + (x.rate as number), 0) / arr.length;
  return Math.round(avg(cur) - avg(prev));
}

/** 综合随机模式的整体正确率（0-100，无数据显示 0） */
export function overallRateOf(stats: Stats): number {
  const recs = stats.history.filter((r) => r.mode === "mix");
  const t = recs.reduce((s, r) => s + r.total, 0);
  const c = recs.reduce((s, r) => s + r.correct, 0);
  return t ? Math.round((c / t) * 100) : 0;
}

/** 薄弱字：字卡聚合（cards 按 pair:char 累计对错），按累计错误次数降序、
    同次数按正确率升序、再按最近作答，取前 N */
export function weakCardsOf(limit = 10): CardRecord[] {
  return Object.values(store.getCards())
    .filter((c): c is CardRecord => !!c && (c as CardRecord).wrongCount > 0)
    .sort(
      (a, b) =>
        b.wrongCount - a.wrongCount ||
        a.correctCount / (a.reps || 1) - b.correctCount / (b.reps || 1) ||
        b.lastTs - a.lastTs,
    )
    .slice(0, limit);
}

/** 有效错题（排除已掌握标记而隐藏的记录），按最近出错排序 */
export function activeWrongItems(): WrongItem[] {
  const wb = store.getWrongBook();
  return Object.values(wb)
    .filter((it) => !it.hidden)
    .sort((a, b) => b.lastTime - a.lastTime);
}

export { pairMeta, readingOf, totalEntries, wordOf, PAIR_ORDER };
