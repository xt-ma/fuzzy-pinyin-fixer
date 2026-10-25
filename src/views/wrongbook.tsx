import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { motion } from "motion/react";
import { GripVerticalIcon, InfoIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PairBadge } from "@/components/app/pair-badge";
import type { WrongItem } from "@/lib/storage";
import { useAppStore } from "@/stores/app";
import { useUiStore } from "@/stores/ui";
import { activeWrongItems, fmtClock } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { practiceOne, startWrongbookPractice } from "./start-practice";

const ORDER_KEY = "fpf_wrongOrder";

/** 设备级排序偏好（直接 localStorage，不进数据表/不触发云同步） */
function loadOrder(): string[] {
  try {
    const raw = (globalThis as { localStorage?: Storage }).localStorage?.getItem(ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function saveOrder(chars: string[]): void {
  try {
    (globalThis as { localStorage?: Storage }).localStorage?.setItem(ORDER_KEY, JSON.stringify(chars));
  } catch {
    /* ignore */
  }
}

/** 按保存的顺序排列（未记录的按最近出错时间排在后面） */
function applyOrder(items: WrongItem[]): WrongItem[] {
  const order = loadOrder();
  const rank = new Map(order.map((c, i) => [c, i]));
  return items.slice().sort((a, b) => (rank.get(a.char) ?? 1e9) - (rank.get(b.char) ?? 1e9) || b.lastTime - a.lastTime);
}

function SortableRow({ item, onPractice, onRemove }: {
  item: WrongItem;
  onPractice: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.char });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };
  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs",
        isDragging && "ring-primary/40 relative z-20 shadow-lg ring-4",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="拖拽调整顺序"
        className="text-muted-foreground hover:text-foreground flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-xl font-semibold">{item.char}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{item.word}</span>
          <PairBadge pair={item.pair} />
          <Badge variant="destructive">{item.wrongPy}</Badge>
          <b className="text-success font-mono text-sm">{item.correctPy}</b>
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          出错 {item.count} 次 · 最近出错 {fmtClock(item.lastTime)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onPractice}>
          <RotateCcwIcon /> 重练
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2Icon /> 移除
        </Button>
      </div>
    </motion.div>
  );
}

export function WrongbookView() {
  const version = useAppStore((s) => s.version);
  const removeWrong = useAppStore((s) => s.removeWrong);
  const confirm = useUiStore((s) => s.confirm);
  const toast = useUiStore((s) => s.toast);

  /* 拖拽重排：本地 override 顺序；数据变更（版本号变化）时回落到持久化顺序 */
  const [overrideOrder, setOverrideOrder] = useState<string[] | null>(null);
  useEffect(() => setOverrideOrder(null), [version]);
  const display = useMemo(() => {
    if (overrideOrder) {
      const rank = new Map(overrideOrder.map((c, i) => [c, i]));
      return activeWrongItems().sort((a, b) => (rank.get(a.char) ?? 1e9) - (rank.get(b.char) ?? 1e9) || b.lastTime - a.lastTime);
    }
    return applyOrder(activeWrongItems());
  }, [version, overrideOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (ev: DragEndEvent) => {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIndex = display.findIndex((i) => i.char === active.id);
    const newIndex = display.findIndex((i) => i.char === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(display, oldIndex, newIndex).map((i) => i.char);
    setOverrideOrder(next);
    saveOrder(next);
  };

  const doRemove = async (char: string) => {
    const go = await confirm("移除错题", `确定将「${char}」从错题本移除吗？`, { danger: true });
    if (!go) return;
    removeWrong(char);
    toast("已从错题本移除");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="错题本" desc="答错的字自动累积在此，去重保存；集中重练直到掌握。">
        <Button disabled={!display.length} onClick={startWrongbookPractice}>
          <RotateCcwIcon /> 一键重练全部（{display.length} 题）
        </Button>
      </PageHeader>

      {display.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={display.map((i) => i.char)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {display.map((item) => (
                <SortableRow
                  key={item.char}
                  item={item}
                  onPractice={() => practiceOne(item.char, item.pair)}
                  onRemove={() => doRemove(item.char)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <Card>
          <CardContent>
            <EmptyState text="错题本是空的，答错的字会自动出现在这里" />
          </CardContent>
        </Card>
      )}

      <div className="border-muted bg-muted/40 text-muted-foreground flex items-start gap-3 rounded-lg border p-4 text-sm">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <span>错题去重累积（同一字多次出错只保留一条、累计次数）；重练时连续答对 2 次自动移出，也可手动移除。列表可拖拽调整顺序。</span>
      </div>
    </div>
  );
}
