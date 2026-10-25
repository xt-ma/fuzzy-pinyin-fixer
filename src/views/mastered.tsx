import { useMemo, useState } from "react";
import { SearchIcon, Undo2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PairBadge } from "@/components/app/pair-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAppStore } from "@/stores/app";
import { useUiStore } from "@/stores/ui";
import { statsOf, fmtTime, readingOf, wordOf, PAIR_ORDER, pairMeta, totalEntries } from "@/lib/stats";
import { cn, pairTextClass } from "@/lib/utils";

export function MasteredView() {
  const version = useAppStore((s) => s.version);
  const removeMastered = useAppStore((s) => s.removeMastered);
  const confirm = useUiStore((s) => s.confirm);
  const toast = useUiStore((s) => s.toast);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const stats = useMemo(() => statsOf(7), [version]);
  const all = useMemo(
    () => Object.values(stats.mastered).sort((a, b) => b.time - a.time),
    [stats],
  );
  const list = useMemo(() => {
    let l = all;
    if (filter !== "all") l = l.filter((m) => m.pair === filter);
    const q = search.trim();
    if (q) l = l.filter((m) => m.char.includes(q) || wordOf(m).includes(q));
    return l;
  }, [all, filter, search]);

  const allTotal = totalEntries();
  const pct = allTotal ? Math.round((all.length / allTotal) * 100) : 0;

  const revoke = async (char: string) => {
    const go = await confirm("撤回已掌握", `撤回后「${char}」将重新参与出题，确定吗？`);
    if (!go) return;
    removeMastered(char);
    toast(`已撤回「${char}」`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="已掌握字库" desc="已掌握的字不再出现在出题池中；误标记可随时撤回。">
        <div className="relative">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索字或词语…" className="w-full pl-8 sm:w-60" />
        </div>
      </PageHeader>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">共 {all.length} 字已掌握</span>
            <Badge variant="secondary">约 {pct}% 已认全</Badge>
          </div>
          <Progress value={pct} className="mt-3" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setFilter("all")}
              className={cn("min-h-9 rounded-md border px-3 text-sm font-medium transition-colors", filter === "all" ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}
            >
              全部
            </button>
            {PAIR_ORDER.map((p) => (
              <button
                key={p}
                onClick={() => setFilter(p)}
                className={cn("min-h-9 rounded-md border px-3 text-sm font-medium transition-colors", filter === p ? cn(pairTextClass(p), "border-current/40 bg-current/5") : "hover:bg-accent")}
              >
                {pairMeta(p).label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {list.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>字</TableHead>
                    <TableHead>词语</TableHead>
                    <TableHead>音对</TableHead>
                    <TableHead>正确读音</TableHead>
                    <TableHead>掌握时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((m) => (
                    <TableRow key={m.char}>
                      <TableCell className="text-lg font-semibold">{m.char}</TableCell>
                      <TableCell className="text-muted-foreground">{wordOf(m)}</TableCell>
                      <TableCell><PairBadge pair={m.pair} /></TableCell>
                      <TableCell><b className="font-mono">{readingOf(m.char, m.pair)}</b></TableCell>
                      <TableCell className="text-muted-foreground">{fmtTime(m.time)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => revoke(m.char)}>
                          <Undo2Icon /> 撤回
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState text={all.length ? "没有符合筛选/搜索的字" : "还没有已掌握的字，答题答对后标记即可"} />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
