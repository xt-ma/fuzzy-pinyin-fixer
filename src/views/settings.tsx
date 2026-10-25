import { useRef, useState } from "react";
import {
  BrainIcon,
  CloudIcon,
  CopyIcon,
  DatabaseIcon,
  DownloadIcon,
  KeyRoundIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
  Volume2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { StatCard } from "@/components/app/stat-card";
import { PageHeader } from "@/components/app/page-header";
import { useAppStore } from "@/stores/app";
import { useSyncStore } from "@/stores/sync";
import { useUiStore } from "@/stores/ui";
import { store as storage } from "@/lib/storage";
import { Sync } from "@/lib/sync";
import { tts } from "@/lib/tts";
import { fmtClock } from "@/lib/stats";
import { bindRemoteKey, generateNewKey, resetKey, clearLocalData } from "@/lib/sync-flows";

function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="text-primary size-4" />
      {children}
    </div>
  );
}

function Row({ title, desc, children }: { title: string; desc?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t py-4 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        {desc && <div className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  const version = useAppStore((s) => s.version);
  const setSettings = useAppStore((s) => s.setSettings);
  const refreshAll = useAppStore((s) => s.refresh);
  const clearAllLocal = useAppStore((s) => s.clearAllLocal);
  const syncStatus = useSyncStore((s) => s.status);
  const refreshSync = useSyncStore((s) => s.refresh);
  const confirm = useUiStore((s) => s.confirm);
  const toast = useUiStore((s) => s.toast);
  const [remoteKey, setRemoteKey] = useState("");
  const [server, setServer] = useState(syncStatus.server || "");
  const fileRef = useRef<HTMLInputElement>(null);

  const reviews = storage.getReviews();
  const cards = storage.getCards();
  const wrongVisible = Object.values(storage.getWrongBook()).filter((w) => !w.hidden).length;
  const masteredCount = Object.keys(storage.getMastered()).length;
  const fsrsOn = !!settings.enableFSRS;
  const dueCount = storage.getDueKeys(Date.now(), 1000000).length;

  /* ---------- 云同步动作 ---------- */
  const doBind = async () => {
    const okBind = await bindRemoteKey(remoteKey, confirm, toast);
    if (okBind) setRemoteKey("");
    refreshSync();
    refreshAll();
  };
  const doManualSync = async () => {
    if (!settings.syncKey || !settings.syncServer) {
      toast("请先绑定密钥并填写服务器地址");
      return;
    }
    const ok = await Sync.syncNow();
    refreshSync();
    toast(ok ? "同步完成" : "同步失败：" + (Sync.status().error || "网络错误"));
  };
  const doCopyKey = async () => {
    const k = settings.syncKey;
    if (!k) return;
    try {
      await navigator.clipboard.writeText(k);
      toast("密钥已复制，可在其他设备设置页粘贴");
    } catch {
      toast("自动复制失败，请手动复制：" + k);
    }
  };

  /* ---------- 导出 / 导入 ---------- */
  const doExport = () => {
    const obj = storage.exportData();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    a.href = url;
    a.download = `fpf-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("备份已导出，请妥善保存文件");
  };
  const onImportFile = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = storage.importData(String(reader.result));
      if (!res.ok) {
        toast("导入失败：" + res.error);
        return;
      }
      refreshAll();
      refreshSync();
      const m = res.merged;
      toast(`导入完成：新增流水 ${m.reviews} 条、字卡 ${m.cards} 张、错题 ${m.wrongBook} 条、已掌握 ${m.mastered} 字、轮次 ${m.history} 条（与本地数据合并）`);
    };
    reader.onerror = () => toast("读取文件失败，请重试");
    reader.readAsText(file, "utf-8");
  };

  const syncStatusBadge = () => {
    const parts: string[] = [];
    if (syncStatus.lastSyncAt) parts.push("上次同步 " + fmtClock(syncStatus.lastSyncAt));
    if (syncStatus.pending) parts.push("待推送");
    if (syncStatus.error) parts.push("错误:" + syncStatus.error);
    return (
      <Badge variant={syncStatus.error ? "destructive" : syncStatus.pending ? "outline" : "secondary"}>
        {parts.length ? parts.join(" · ") : "未同步"}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="设置与数据" desc="数据全部保存在本机浏览器中。导出备份文件（可放入坚果云等同步盘）即可在另一台设备导入，继续之前的进度。" />

      {/* 数据概况 */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="答题流水" value={`${reviews.length} 条`} />
        <StatCard label="字卡" value={`${Object.keys(cards).length} 张`} />
        <StatCard label="错题本" value={`${wrongVisible} 条`} />
        <StatCard label="已掌握" value={`${masteredCount} 字`} />
      </div>

      {/* 云同步 */}
      <Card>
        <CardContent className="space-y-4">
          <SectionTitle icon={CloudIcon}>云同步</SectionTitle>
          <div className="border-primary/30 bg-primary/5 flex items-start gap-3 rounded-lg border p-3 text-sm">
            {settings.syncKey ? (
              <span>
                本机已绑定密钥
                {settings.enableSync ? "，自动同步已开启：打开应用自动拉取、练习后自动推送。" : "，自动同步已关闭：练习数据不会自动上传，可随时点「立即同步」。"}
              </span>
            ) : (
              <span>本机尚未绑定密钥：粘贴另一台设备的密钥后点「确定同步」，或点「生成新密钥」创建全新同步空间（请立即复制保存，丢失无法找回）。</span>
            )}
          </div>
          <div>
            <div className="text-sm font-medium">同步服务器地址</div>
            <div className="text-muted-foreground mt-0.5 text-xs">你的 Cloudflare Worker 地址（部署流程见 docs/deploy-cloudflare.md）。</div>
            <Input
              className="mt-1.5"
              placeholder="https://fpf-sync.你的用户名.workers.dev"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              onBlur={() => {
                if ((server || "").trim() !== (settings.syncServer || "")) {
                  setSettings({ syncServer: (server || "").trim() });
                  toast("同步服务器地址已保存");
                }
              }}
            />
          </div>
          <div>
            <div className="text-sm font-medium">同步密钥（远端）</div>
            <div className="text-muted-foreground mt-0.5 text-xs">粘贴另一台设备已生成的密钥；首次使用请点下方「生成新密钥」。</div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Input
                className="min-w-52 flex-1 font-mono"
                placeholder="fpf-xxxxxxxx...（粘贴已有的密钥）"
                value={remoteKey}
                onChange={(e) => setRemoteKey(e.target.value)}
              />
              <Button onClick={doBind}>确定同步</Button>
              <Button variant="outline" onClick={doManualSync}>
                <RefreshCwIcon /> 立即同步
              </Button>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">本机绑定密钥</div>
            <div className="text-muted-foreground mt-0.5 text-xs">当前设备正在使用的密钥（只读，由上方绑定或生成而来）。</div>
            <div className="bg-muted mt-1.5 overflow-x-auto rounded-md border p-2.5 font-mono text-xs whitespace-nowrap">
              {settings.syncKey || "（未绑定）"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => generateNewKey(confirm, toast).then(() => { refreshSync(); refreshAll(); })}>
                <KeyRoundIcon /> 生成新密钥
              </Button>
              {!!settings.syncKey && (
                <>
                  <Button variant="outline" onClick={doCopyKey}>
                    <CopyIcon /> 复制
                  </Button>
                  <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => resetKey(confirm, toast).then(() => { refreshSync(); refreshAll(); })}>
                    重置
                  </Button>
                </>
              )}
              {syncStatusBadge()}
            </div>
          </div>
          <Row
            title="自动同步"
            desc="开启后练习数据自动推送；关闭则仅通过「立即同步」手动同步。"
          >
            <Switch
              checked={!!settings.enableSync}
              onCheckedChange={(on) => {
                setSettings({ enableSync: on });
                if (on && settings.syncKey && settings.syncServer) Sync.init();
                toast(on ? "已开启自动同步" : "已关闭自动同步（可手动「立即同步」）");
              }}
            />
          </Row>
        </CardContent>
      </Card>

      {/* 语音朗读 */}
      <Card>
        <CardContent>
          <SectionTitle icon={Volume2Icon}>语音朗读</SectionTitle>
          <Row
            title="作答后自动朗读"
            desc={
              tts.supported()
                ? "作答后自动朗读字词的普通话读音，帮助建立听觉印象；作答完成后可点词语旁的喇叭图标反复重听。使用设备自带语音引擎，无需联网。"
                : "当前浏览器不支持语音朗读。"
            }
          >
            <Switch
              disabled={!tts.supported()}
              checked={tts.supported() && !!settings.ttsEnabled}
              onCheckedChange={(on) => {
                tts.setEnabled(on);
                refreshAll();
                toast(on ? "朗读已开启" : "朗读已关闭");
              }}
            />
          </Row>
        </CardContent>
      </Card>

      {/* FSRS */}
      <Card>
        <CardContent className="space-y-4">
          <SectionTitle icon={BrainIcon}>记忆调度（FSRS）</SectionTitle>
          <Row title="智能复习" desc="按记忆曲线安排复习：到期的字优先出现，生疏的字复习更频繁、熟练的字间隔拉长。关闭则回到纯随机出题。">
            <Switch
              checked={fsrsOn}
              onCheckedChange={(on) => {
                setSettings({ enableFSRS: on });
                toast(on ? "已启用记忆调度（到期字优先复习）" : "已切换回纯随机出题");
              }}
            />
          </Row>
          <div className="border rounded-lg border-current/10 p-3 text-sm flex items-start gap-2">
            {fsrsOn ? (
              <span>
                记忆调度已启用：到期字优先复习。当前待复习 <b>{dueCount}</b> 字，已建立 <b>{Object.keys(cards).length}</b> 张字卡（每个字 × 音对一张）。
              </span>
            ) : (
              <span>记忆调度已关闭：出题为纯随机（旧逻辑），随时可重新开启。</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 备份与迁移 */}
      <Card>
        <CardContent>
          <SectionTitle icon={DatabaseIcon}>备份与迁移</SectionTitle>
          <Row title="导出数据" desc="打包全部学习记录为 JSON 文件，可在任意设备导入恢复。">
            <Button onClick={doExport}>
              <DownloadIcon /> 导出备份
            </Button>
          </Row>
          <Row title="导入数据" desc={<>从备份文件恢复；与本地已有数据<b>合并</b>，不会覆盖丢失。</>}>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <UploadIcon /> 选择文件导入
            </Button>
          </Row>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onImportFile} />
          <Row
            title="清除本地数据"
            desc="删除本机全部练习记录、密钥与同步配置（云端数据不受影响）。用于换人使用/重新开始。"
          >
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() =>
                clearLocalData(confirm, toast).then(() => {
                  clearAllLocal();
                  refreshSync();
                })
              }
            >
              <Trash2Icon /> 清除本地数据
            </Button>
          </Row>
        </CardContent>
      </Card>

      {/* 使用提示 */}
      <Card>
        <CardContent>
          <SectionTitle icon={DatabaseIcon}>使用提示</SectionTitle>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1.5 pl-5 text-sm">
            <li>数据存于本浏览器，清除浏览器数据会一并删除——请定期导出备份。</li>
            <li>多设备同步：把导出文件放入坚果云同步文件夹，另一台设备导入即可；两端数据会自动合并。</li>
            <li>答题流水（对/错每次作答）与字卡状态都会完整备份，供记忆模型使用。</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
