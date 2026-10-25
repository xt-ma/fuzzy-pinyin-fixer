import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { motion } from "motion/react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** 统计卡：标签 + 主值 + 可选趋势差值（正升绿/负降红） */
export function StatCard({
  label,
  value,
  delta,
  unit,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  unit?: string;
  className?: string;
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl font-semibold tabular-nums"
          >
            {value}
          </motion.span>
          {unit && <span className="text-muted-foreground text-xs">{unit}</span>}
          {delta != null && (
            <span
              className={cn(
                "ml-auto inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
                delta >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
              )}
            >
              {delta >= 0 ? <TrendingUpIcon className="size-3" /> : <TrendingDownIcon className="size-3" />}
              {delta >= 0 ? "+" : ""}
              {delta}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
