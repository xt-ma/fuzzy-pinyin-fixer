/* ============================================================
   模糊音克星 · 应用数据/设置 store（Zustand）
   localStorage（src/lib/storage.ts）仍是唯一事实来源；
   本 store 持有内存镜像 + 版本号，动作写穿 storage 后刷新镜像驱动 React。
   ============================================================ */
import { create } from "zustand";
import {
  store as storage,
  type CardRecord,
  type HistoryRecord,
  type MasteredItem,
  type ReviewRecord,
  type Settings,
  type WrongItem,
} from "../lib/storage.ts";

interface AppState {
  version: number;
  settings: Settings;
  reviews: ReviewRecord[];
  cards: Record<string, CardRecord>;
  wrongBook: Record<string, WrongItem>;
  mastered: Record<string, MasteredItem>;
  history: HistoryRecord[];

  /** 从 storage 重新拉取镜像并触发订阅更新（任何 storage 写入后调用） */
  refresh: () => void;
  /** 供外部（quiz store 等）在 storage 变更后轻量触发更新 */
  bump: () => void;

  setSettings: (patch: Settings) => void;
  addMastered: (char: string, pair: string) => void;
  removeMastered: (char: string) => void;
  removeWrong: (char: string) => void;
  clearAllLocal: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  version: 0,
  settings: storage.getSettings(),
  reviews: [],
  cards: {},
  wrongBook: {},
  mastered: {},
  history: [],

  refresh: () =>
    set((s) => ({
      version: s.version + 1,
      settings: storage.getSettings(),
      reviews: storage.getReviews(),
      cards: storage.getCards(),
      wrongBook: storage.getWrongBook(),
      mastered: storage.getMastered(),
      history: storage.getHistory(),
    })),

  bump: () => set((s) => ({ version: s.version + 1 })),

  setSettings: (patch) => {
    storage.setSettings(patch);
    set((s) => ({ version: s.version + 1, settings: storage.getSettings() }));
  },

  addMastered: (char, pair) => {
    storage.addMastered(char, pair);
    set((s) => ({ version: s.version + 1, mastered: storage.getMastered(), wrongBook: storage.getWrongBook() }));
  },

  removeMastered: (char) => {
    storage.removeMastered(char);
    set((s) => ({ version: s.version + 1, mastered: storage.getMastered(), wrongBook: storage.getWrongBook() }));
  },

  removeWrong: (char) => {
    storage.removeWrong(char);
    set((s) => ({ version: s.version + 1, wrongBook: storage.getWrongBook() }));
  },

  clearAllLocal: () => {
    storage.clearAll();
    set((s) => ({
      version: s.version + 1,
      settings: storage.getSettings(),
      reviews: [],
      cards: {},
      wrongBook: {},
      mastered: {},
      history: [],
    }));
  },
}));

/** 非 React 上下文（测试/工具）使用的便捷读取 */
export const appStore = useAppStore;
