import * as React from "react";

import { cn } from "@/lib/utils";

/** 进度条（自绘：支持常规与无限模式流动动画 + Motion 由外层驱动宽度过渡） */
function Progress({
  value,
  className,
  indeterminate,
  barClassName,
  ...props
}: React.ComponentProps<"div"> & {
  /** 0-100；indeterminate 时忽略 */
  value?: number;
  /** 无限模式：流动动画 */
  indeterminate?: boolean;
  barClassName?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value ?? 0)}
      aria-valuetext={indeterminate ? "无限模式" : undefined}
      className={cn("bg-secondary relative h-2 w-full overflow-hidden rounded-full", className)}
      {...props}
    >
      {indeterminate ? (
        <div className={cn("bg-primary progress-infinite-bar absolute inset-y-0 left-0 w-full origin-left", barClassName)} />
      ) : (
        <div
          className={cn("bg-primary absolute inset-y-0 left-0 rounded-full transition-[width] duration-300", barClassName)}
          style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }}
        />
      )}
    </div>
  );
}

export { Progress };
