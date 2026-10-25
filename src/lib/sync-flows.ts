/* ============================================================
   模糊音克星 · 云同步设置交互流程（从 js/app.js 的按钮 handler 提炼）
   确认弹窗以回调注入（UI 用 AlertDialog 实现；测试用脚本化 confirm），
   交互语义与旧版一致：校验顺序 / 污染警告条件 / 双重确认 / 提示文案。
   ============================================================ */
import { store } from "./storage.ts";
import { Sync } from "./sync.ts";

/** 确认回调：展示 (标题, 说明（可含简单 HTML 粗体）)，返回用户是否确认 */
export type ConfirmFn = (title: string, html: string) => Promise<boolean>;
/** 提示回调（toast） */
export type NotifyFn = (msg: string) => void;

/** 本机练习数据量（流水 + 字卡），用于污染警告判断 */
export function localDataCount(): number {
  return store.getReviews().length + Object.keys(store.getCards()).length;
}

/**
 * 「确定同步」：粘贴远端密钥 → 校验 → （本机有数据时确认双向合并）→ 绑定 → 立即同步一次。
 * 返回是否完成绑定。
 */
export async function bindRemoteKey(input: string, confirm: ConfirmFn, notify: NotifyFn): Promise<boolean> {
  const val = String(input || "").trim();
  if (!Sync.isValidKey(val)) {
    notify("密钥格式不正确（应为 fpf- 开头的长字符串），请检查后重试");
    return false;
  }
  if (!store.getSettings().syncServer) {
    notify("请先填写同步服务器地址");
    return false;
  }
  // 本地已有练习数据时：双向合并会把本机数据推送到该密钥空间（换人/换设备时防污染）
  const n = localDataCount();
  const bind = async () => {
    store.setSettings({ syncKey: val });
    const ok = await Sync.syncNow();
    if (ok) {
      notify("密钥已绑定并同步成功");
      return true;
    }
    notify("同步失败：" + (Sync.status().error || "网络错误"));
    return true; // 密钥已绑定（同步失败可手动重试）
  };
  if (n > 0) {
    const go = await confirm(
      "确认绑定该密钥？",
      "本机已有 " + n + " 条练习数据，绑定后将与该密钥的云端数据<b>双向合并</b>（本机数据会上传到该空间）。如想纯净恢复/切换身份，请先「导出备份」并「清除本地数据」。确定继续？",
    );
    if (!go) return false;
  }
  return await bind();
}

/**
 * 「生成新密钥」：本地有练习数据时警告（本机数据将上传到新空间），确认后生成并绑定。
 */
export async function generateNewKey(confirm: ConfirmFn, notify: NotifyFn): Promise<boolean> {
  const n = localDataCount();
  const warn =
    n > 0
      ? "本机已有 " + n + " 条练习数据，生成新密钥后这些数据将同步到<b>新空间</b>。若这些数据不属于你（他人浏览器/共享电脑），请先「导出备份」并「清除本地数据」再生成。"
      : "将生成一把全新密钥并创建新的同步空间。";
  const go = await confirm("生成新密钥", warn + " 若你已有密钥，请粘贴到上方「同步密钥（远端）」输入框后点「确定同步」。确定生成？");
  if (!go) return false;
  store.setSettings({ syncKey: Sync.generateKey() });
  notify("已生成新密钥，请立即点「复制」保存（密钥丢失无法找回）");
  return true;
}

/**
 * 「重置密钥」：作废旧空间（云端数据将被删除）+ 生成新密钥。
 */
export async function resetKey(confirm: ConfirmFn, notify: NotifyFn): Promise<boolean> {
  const go = await confirm("重置密钥", "将删除当前密钥对应云端空间里的全部数据，并生成新密钥。此操作不可恢复，强烈建议先导出备份。确定吗？");
  if (!go) return false;
  await Sync.resetSpace();
  store.setSettings({ syncKey: Sync.generateKey() });
  notify("已生成新密钥");
  return true;
}

/**
 * 「清除本地数据」（换人使用/重新开始；云端数据不受影响）——双重确认。
 */
export async function clearLocalData(confirm: ConfirmFn, notify: NotifyFn): Promise<boolean> {
  const hasData = localDataCount() > 0;
  const go1 = await confirm(
    "清除本地数据",
    "将删除本机全部练习记录、密钥与同步配置，且<b>不可恢复</b>！云端数据不受影响。强烈建议先「导出备份」。确定继续？",
  );
  if (!go1) return false;
  const go2 = await confirm(
    "再次确认",
    "真的要清除本机全部数据吗？此操作无法撤销。若稍后想找回，只能靠之前导出的备份文件。确定清除？",
  );
  if (!go2) return false;
  store.clearAll();
  try {
    (globalThis as { localStorage?: Storage }).localStorage!.removeItem("fpf_syncMeta");
  } catch {
    /* ignore */
  }
  notify(hasData ? "本地数据已全部清除" : "本地数据已清除（本来就没有记录）");
  return true;
}
