import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { PlayIcon, RotateCcwIcon, SparklesIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/app/segmented";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PairBadge } from "@/components/app/pair-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAppStore } from "@/stores/app";
import { useUiStore } from "@/stores/ui";
import { statsOf, trendDelta, overallRateOf, fmtClock, PAIR_ORDER, pairMeta, totalEntries } from "@/lib/stats";
import { cn, pairBgClass } from "@/lib/utils";
import { startPractice, startWrongbookPractice } from "./start-practice";

const PRESETS = [5, 10, 20] as const;

function HistoryTable() {
  useAppStore((s) => s.version); // 订阅数据版本：作答后刷新最近练习
  const recent = statsOf(7).history.slice(-4).reverse();
  if (!recent.length) return <EmptyState text="还没有练习记录，点击上方「开始综合练习」开始吧" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>时间</TableHead>
          <TableHead>模式</TableHead>
          <TableHead>题数</TableHead>
          <TableHead>正确率</TableHead>
          <TableHead>结果</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recent.map((r, i) => {
          const rate = r.total ? Math.round((r.correct / r.total) * 100) : 0;
          return (
            <TableRow key={i}>
              <TableCell className="text-muted-foreground">{fmtClock(r.date || 0)}</TableCell>
              <TableCell>{r.mode === "pair" ? <><PairBadge pair={r.pair || ""} /> 专项</> : "综合随机"}</TableCell>
              <TableCell className="tabular-nums">{r.total}</TableCell>
              <TableCell className="tabular-nums">{rate}%</TableCell>
              <TableCell>
                <Badge variant={rate >= 80 ? "success" : rate >= 60 ? "secondary" : "destructive"}>
                  {rate >= 80 ? "不错" : rate >= 60 ? "继续加油" : "需要巩固"}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function HomeView() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const version = useAppStore((s) => s.version);
  const toast = useUiStore((s) => s.toast);
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState("");

  // 订阅数据版本：作答/导入后首页统计即时刷新
  const stats = useMemo(() => statsOf(7), [version, settings]);
  const delta = trendDelta(stats, 7);
  const wrongCount = Object.values(stats.wrongBook).filter((it) => !it.hidden).length;
  const defaultCount = settings.defaultCount ?? 10;
  const isCustom = typeof defaultCount === "number" && !(PRESETS as readonly number[]).includes(defaultCount);

  const applyCount = (v: number | "infinite") => {
    setSettings({ defaultCount: v });
    toast(v === "infinite" ? "已设为无限模式" : `题量已设为 ${v} 题`);
  };
  const applyCustom = () => {
    const v = Math.round(Number(customVal));
    if (!isFinite(v) || v < 1 || v > 1000) {
      toast("请输入 1 - 1000 之间的整数");
      return;
    }
    applyCount(v);
    setCustomOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="选择练习模式" desc="针对自己的薄弱音对专项训练，或直接综合随机。答对可标记「已掌握」，答错自动进入错题本。" />

      {/* 音对卡 + 综合随机 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...PAIR_ORDER.map((p) => ({ key: p, meta: pairMeta(p), rate: stats.pairStats[p].rate })), null].map((item, i) =>
          item ? (
            <motion.button
              key={item.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => startPractice("pair", item.key)}
              className="focus-visible:ring-[3px] focus-visible:ring-ring/50 text-left outline-none"
            >
              <Card className="gap-0 py-5 transition-shadow hover:shadow-md">
                <CardContent className="px-5">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-block size-2.5 rounded-full", pairBgClass(item.key))} />
                    <span className="text-base font-semibold" style={{ color: item.meta.color }}>{item.meta.label}</span>
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {item.meta.desc} · {item.meta.totalEntries} 字
                  </div>
                  <Progress className="mt-3 h-1.5" value={item.rate ?? 0} barClassName="bg-[var(--c)]" style={{ "--c": item.meta.color } as React.CSSProperties} />
                  <div className="text-muted-foreground mt-2 text-xs">正确率 {item.rate == null ? "--" : item.rate + "%"}</div>
                </CardContent>
              </Card>
            </motion.button>
          ) : (
            <motion.button
              key="__mix"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.25 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => startPractice("mix", null)}
              className="focus-visible:ring-[3px] focus-visible:ring-ring/50 text-left outline-none"
            >
              <Card className="gap-0 border-primary/40 py-5 transition-shadow hover:shadow-md">
                <CardContent className="px-5">
                  <div className="flex items-center gap-2">
                    <SparklesIcon className="text-primary size-4" />
                    <span className="text-primary text-base font-semibold">综合随机</span>
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">混合所有音对 · {totalEntries()} 字</div>
                  <Progress className="mt-3 h-1.5" value={overallRateOf(stats)} />
                  <div className="text-primary mt-2 text-xs font-medium">推荐 · 每日一练</div>
                </CardContent>
              </Card>
            </motion.button>
          ),
        )}
      </div>

      {/* 概览统计 */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="总正确率" value={stats.totalRate == null ? "--" : `${stats.totalRate}%`} />
        <StatCard label="7 天趋势" value={delta == null ? "--" : `${delta >= 0 ? "+" : ""}${delta}%`} delta={delta} />
        <StatCard label="音对分布" value={`${PAIR_ORDER.length} 组`} />
        <StatCard label="待重练错题" value={`${wrongCount} 条`} />
      </div>

      {/* 操作行 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={() => startPractice("mix", null)}>
            <PlayIcon /> 开始综合练习
          </Button>
          <Button size="lg" variant="outline" disabled={!wrongCount} onClick={startWrongbookPractice}>
            <RotateCcwIcon /> 错题重练
          </Button>
        </div>
        <Segmented
          items={[
            ...PRESETS.map((n) => ({ value: n as number | string, label: `${n} 题` })),
            { value: "custom" as const, label: isCustom ? `自定义 · ${defaultCount} 题` : "自定义" },
            { value: "infinite" as const, label: "无限" },
          ]}
          value={isCustom ? "custom" : (defaultCount as number | string)}
          onChange={(v) => {
            if (v === "custom") {
              setCustomVal(typeof defaultCount === "number" ? String(defaultCount) : "");
              setCustomOpen(true);
            } else if (v === "infinite") {
              applyCount("infinite");
            } else {
              applyCount(v as number);
            }
          }}
        />
      </div>

      {/* 最近练习 */}
      <Card>
        <CardContent className="flex items-center justify-between pb-4">
          <span className="text-sm font-medium">最近练习</span>
          <Badge variant="secondary">本地记录</Badge>
        </CardContent>
        <HistoryTable />
      </Card>

      {/* 自定义题量 */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>自定义题量</DialogTitle>
            <DialogDescription>输入每轮答题数量（1 - 1000 题）</DialogDescription>
          </DialogHeader>
          <Input
            type="number" min={1} max={1000} placeholder="例如 30" value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)}>取消</Button>
            <Button onClick={applyCustom}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
