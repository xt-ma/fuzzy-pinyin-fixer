import { motion } from "motion/react";

import { cn } from "@/lib/utils";

export interface SegmentedItem<T extends string | number> {
  value: T;
  label: React.ReactNode;
}

/** 分段选择器（Motion 滑动指示灯；替代旧版 .segmented） */
export function Segmented<T extends string | number>({
  items,
  value,
  onChange,
  className,
  size = "default",
}: {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "default" | "lg";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "bg-muted text-muted-foreground inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg p-1",
        className,
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={String(it.value)}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "relative rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              size === "lg" ? "min-h-11 px-4 py-2 text-sm" : "min-h-9 px-3 py-1.5 text-sm",
              active ? "text-foreground" : "hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-background absolute inset-0 rounded-md shadow-sm"
                style={{ zIndex: 0 }}
                transition={{ duration: 0.15 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
