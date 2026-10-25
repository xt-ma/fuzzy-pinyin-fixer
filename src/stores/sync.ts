/* ============================================================
   模糊音克星 · 同步状态 store（Zustand）
   镜像 Sync.status()；Sync.setOnSync 推送变更 → React 刷新。
   ============================================================ */
import { create } from "zustand";
import { Sync, type SyncStatus } from "../lib/sync.ts";

interface SyncUIState {
  status: SyncStatus | { enabled: false; key: ""; server: ""; lastSyncAt: null; pending: false; error: null };
  refresh: () => void;
}

const emptyStatus: SyncStatus = { enabled: false, key: "", server: "", lastSyncAt: null, pending: false, error: null };

export const useSyncStore = create<SyncUIState>((set) => ({
  status: emptyStatus,
  refresh: () => set({ status: Sync.status() }),
}));

/** 应用启动接线：同步状态变更 → store 刷新（App 初始化调用一次） */
export function bindSyncStatus(): void {
  Sync.setOnSync(() => useSyncStore.getState().refresh());
  useSyncStore.getState().refresh();
}
