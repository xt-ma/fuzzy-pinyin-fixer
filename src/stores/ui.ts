/* ============================================================
   模糊音克星 · UI store（Zustand）：视图路由 / toast / 确认弹窗服务
   路由：hash 深链接（#/stats），静态托管直接可用。
   confirm() 返回 Promise——视图层以同步风格书写「确认后续做」流程，
   弹窗本体由 <ConfirmHost/>（AlertDialog）渲染。
   ============================================================ */
import { create } from "zustand";

export type View = "home" | "quiz" | "result" | "stats" | "mastered" | "wrongbook" | "settings";

export const VIEWS: View[] = ["home", "stats", "mastered", "wrongbook", "settings"];

interface ToastItem {
  id: number;
  msg: string;
}

interface ConfirmRequest {
  id: number;
  title: string;
  html: string;
  danger?: boolean;
  /** 用户选择（true=确认） */
  resolve: (ok: boolean) => void;
}

interface UIState {
  view: View;
  statsRange: 7 | 30;
  toasts: ToastItem[];
  confirmReq: ConfirmRequest | null;

  navigate: (v: View) => void;
  /** 依据当前 location.hash 初始化（App 启动时调用一次） */
  initFromHash: () => void;
  toast: (msg: string) => void;
  dismissToast: (id: number) => void;
  confirm: (title: string, html: string, opts?: { danger?: boolean }) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;
  setStatsRange: (d: 7 | 30) => void;
}

let toastSeq = 0;
let confirmSeq = 0;

export const useUiStore = create<UIState>((set, get) => ({
  view: "home",
  statsRange: 7,
  toasts: [],
  confirmReq: null,

  navigate: (v) => {
    set({ view: v });
    if (typeof location !== "undefined" && location.hash !== "#/" + v) {
      // replaceState：避免每次切视图都堆积历史记录（后退语义留给回溯上一题）
      history.replaceState(null, "", v === "home" ? location.pathname + location.search : "#/" + v);
    }
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  },

  initFromHash: () => {
    const h = (typeof location !== "undefined" ? location.hash : "").replace(/^#\/?/, "");
    // quiz/result 是会话态视图（轮次不跨刷新）：刷新后清残留 hash 回首页，
    // 避免「URL 停在答题页、内容却是首页」的不一致
    if (h === "quiz" || h === "result") {
      if (typeof history !== "undefined") history.replaceState(null, "", location.pathname + location.search);
      set({ view: "home" });
      return;
    }
    const known = (VIEWS as string[]).includes(h);
    set({ view: known ? (h as View) : "home" });
    // 未知/空 hash 统一清成首页地址，保持 URL 与视图一致
    if (!known && typeof history !== "undefined" && location.hash !== "") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  },

  toast: (msg) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, msg }] }));
    setTimeout(() => get().dismissToast(id), 1800);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  confirm: (title, html, opts) =>
    new Promise<boolean>((resolve) => {
      set({ confirmReq: { id: ++confirmSeq, title, html, danger: opts?.danger, resolve } });
    }),

  resolveConfirm: (ok) => {
    const req = get().confirmReq;
    set({ confirmReq: null });
    if (req) req.resolve(ok);
  },

  setStatsRange: (d) => set({ statsRange: d }),
}));
