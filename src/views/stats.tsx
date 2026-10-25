import { useMemo } from "react";
import { motion } from "motion/react";
import { RotateCcwIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { statsOf, trendSeries, weakCardsOf, fmtClock, wordOf, PAIR_ORDER, totalEntries } from "@/lib/stats";
import { pairBgClass } from "@/lib/utils";
import { practiceOne } from "./start-practice";

/* 趋势折线图（SVG + Motion 描线/打点动画） */
function TrendChart({ series }: { series: ReturnType<typeof trendSeries> }) {
  const W = 500, H = 170, padL = 30, padR = 24, padT = 30, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (series.length === 1 ? innerW / 2 : (innerW * i) / (series.length - 1));
  const y = (rate: number) => padT + innerH - (rate / 100) * innerH;
  const pts = series.map((s, i) => ({ ...s, i, x: x(i), y: s.rate == null ? null : y(s.rate) })).filter((s) => s.y != null) as { x: number; y: number; rate: number; i: number; label: string }[];
  const path = pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="正确率趋势折线图" className="overflow-visible">
      {[0, 50, 100].map((r) => (
        <g key={r}>
          <line x1={padL} y1={y(r)} x2={W - padR} y2={y(r)} stroke="var(--border)" strokeWidth="1" strokeDasharray={r === 0 ? undefined : "3 3"} />
          <text x={padL - 6} y={y(r) + 4} fontSize="10" fill="var(--muted-foreground)" textAnchor="end">{r}</text>
        </g>
      ))}
      {pts.length >= 2 && (
        <motion.polyline
          points={path}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      )}
      {pts.map((p, k) => (
        <g key={p.i}>
          <motion.circle
            cx={p.x} cy={p.y} r="4" fill="var(--primary)"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3 + k * 0.05, type: "spring", stiffness: 300, damping: 15 }}
          />
          {p.i === series.length - 1 && (
            <text x={p.x - 6} y={Math.max(p.y - 8, 12)} fontSize="12" textAnchor="end" fill="var(--primary)" fontWeight="500">
              今天 {p.rate}%
            </text>
          )}
        </g>
      ))}
      {series.map((s, i) => (
        <text key={i} x={x(i)} y={H - 8} fontSize="11" fill="var(--muted-foreground)" textAnchor="middle">
          {i === series.length - 1 ? "今天" : s.label}
        </text>
      ))}
    </svg>
  );
}

export function StatsView() {
  const range = useUiStore((s) => s.statsRange);
  const setRange = useUiStore((s) => s.setStatsRange);
  const version = useAppStore((s) => s.version);

  const stats = useMemo(() => statsOf(range), [range, version]);
  const series = useMemo(() => trendSeries(stats, range), [stats, range]);
  const masteredCount = Object.keys(stats.mastered).length;
  const allTotal = totalEntries();
  const weak = useMemo(() => weakCardsOf(10), [version]);

  return (
    <div className="space-y-6">
      <PageHeader title="学习统计" desc="追踪你的长期进步，数据仅保存在本机。">
        <Segmented
          items={[{ value: 7 as const, label: "7 天" }, { value: 30 as const, label: "30 天" }]}
          value={range}
          onChange={setRange}
        />
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="总正确率" value={stats.totalRate == null ? "--" : `${stats.totalRate}%`} />
        <StatCard label="累计练习" value={`${stats.total} 题`} />
        <StatCard label="连续打卡" value={`${stats.streak} 天`} />
        <StatCard label="已掌握" value={masteredCount} unit={`/ ${allTotal} 字`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <div className="text-sm font-medium">最近 {range} 天正确率趋势</div>
            <TrendChart series={series} />
            <div className="text-muted-foreground mt-2 flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1"><i className="bg-primary inline-block size-2 rounded-full" />正确率</span>
              <span>无练习的日子不显示数据点</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="text-sm font-medium">各音对正确率分布</div>
            <div className="mt-4 space-y-4">
              {PAIR_ORDER.map((p, i) => {
                const ps = stats.pairStats[p];
                return (
                  <div key={p}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <PairBadge pair={p} />
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {ps.rate == null ? "--" : `${ps.rate}%`} · {ps.masteredCount}/{ps.meta.totalEntries} 字已掌握
                      </span>
                    </div>
                    <Progress
                      value={ps.rate ?? 0}
                      className="h-2"
                      barClassName={pairBgClass(p)}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 薄弱字 TOP 10 */}
      <Card>
        <CardContent className="flex items-center justify-between pb-4">
          <span className="text-sm font-medium">薄弱字 TOP 10</span>
          <Badge variant={weak.length ? "destructive" : "secondary"}>{weak.length} 字</Badge>
        </CardContent>
        {weak.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>字</TableHead>
                  <TableHead>词语</TableHead>
                  <TableHead>音对</TableHead>
                  <TableHead>练习</TableHead>
                  <TableHead>正确率</TableHead>
                  <TableHead>最近作答</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weak.map((c) => {
                  const acc = Math.round((c.correctCount / (c.reps || 1)) * 100);
                  return (
                    <TableRow key={c.pair + ":" + c.char}>
                      <TableCell className="text-lg font-semibold">{c.char}</TableCell>
                      <TableCell className="text-muted-foreground">{wordOf(c)}</TableCell>
                      <TableCell><PairBadge pair={c.pair} /></TableCell>
                      <TableCell className="tabular-nums">{c.reps} 次</TableCell>
                      <TableCell>
                        <Badge variant={acc >= 80 ? "success" : acc >= 50 ? "secondary" : "destructive"}>{acc}%</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{fmtClock(c.lastTs)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => practiceOne(c.char, c.pair)}>
                          <RotateCcwIcon /> 重练
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="text-muted-foreground mt-3 text-xs">
              按累计错误次数排序；开启记忆调度后，生疏字也会更频繁地自动安排复习。
            </div>
          </>
        ) : (
          <EmptyState text="暂无薄弱字：答错的字会按错误次数汇总在这里" />
        )}
      </Card>
    </div>
  );
}
