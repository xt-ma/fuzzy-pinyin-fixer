import { motion } from "motion/react";
import { BarChart3Icon, PartyPopperIcon, RotateCcwIcon, SproutIcon, SmileIcon, TrophyIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/app/empty-state";
import { PairBadge } from "@/components/app/pair-badge";
import { PageHeader } from "@/components/app/page-header";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useQuizStore } from "@/stores/quiz";
import { useUiStore } from "@/stores/ui";
import { retryWrong, again } from "./start-practice";

export function ResultView() {
  const summary = useQuizStore((s) => s.summary);
  const navigate = useUiStore((s) => s.navigate);

  if (!summary) {
    return (
      <div className="space-y-4">
        <PageHeader title="轮末复盘" />
        <EmptyState text="本轮数据不存在，去练习一轮吧" />
        <div className="flex justify-center">
          <Button onClick={() => navigate("home")}>去练习</Button>
        </div>
      </div>
    );
  }

  const { rate, total, correct, wrongList, durationSec } = summary;
  const Icon = rate >= 90 ? TrophyIcon : rate >= 70 ? PartyPopperIcon : rate >= 50 ? SmileIcon : SproutIcon;
  const min = Math.floor(durationSec / 60);
  const sec = durationSec % 60;

  return (
    <div className="space-y-6">
      <PageHeader title="轮末复盘" />

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center px-6 py-10">
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="text-primary flex size-16 items-center justify-center rounded-2xl bg-primary/10"
          >
            <Icon className="size-8" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4 flex items-baseline"
          >
            <span className="text-5xl font-bold tabular-nums">{rate}</span>
            <span className="text-muted-foreground text-xl">%</span>
          </motion.div>
          <p className="text-muted-foreground mt-2 text-sm">
            本轮 {total} 题 · 答对 {correct} · 答错 {wrongList.length} · 用时 {min ? `${min} 分 ` : ""}{sec} 秒
          </p>
          <div className="mt-5 w-full max-w-md">
            <Progress value={rate} className="h-3" />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button size="lg" disabled={!wrongList.length} onClick={retryWrong}>
              <RotateCcwIcon /> 错题重练（{wrongList.length} 题）
            </Button>
            <Button size="lg" variant="outline" onClick={again}>再练一轮</Button>
            <Button size="lg" variant="ghost" onClick={() => navigate("stats")}>
              <BarChart3Icon /> 查看统计
            </Button>
          </div>
          {!!wrongList.length && (
            <div className="text-muted-foreground mt-3 text-xs">{wrongList.length} 道错题已自动加入错题本</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pb-4">
          <span className="text-sm font-medium">本轮错题清单</span>
          <Badge variant={wrongList.length ? "destructive" : "secondary"}>{wrongList.length} 题待重练</Badge>
        </CardContent>
        {wrongList.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>字</TableHead>
                <TableHead>词语</TableHead>
                <TableHead>音对</TableHead>
                <TableHead>你的选择</TableHead>
                <TableHead>正确读音</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wrongList.map((w, i) => (
                <TableRow key={i}>
                  <TableCell className="text-lg font-semibold">{w.char}</TableCell>
                  <TableCell className="text-muted-foreground">{w.word}</TableCell>
                  <TableCell><PairBadge pair={w.pair} /></TableCell>
                  <TableCell><Badge variant="destructive">{w.wrongPy}</Badge></TableCell>
                  <TableCell><b className="text-success font-mono">{w.correctPy}</b></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState text="本轮全部答对，太棒了！" />
        )}
      </Card>
    </div>
  );
}
