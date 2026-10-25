import { InboxIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** 空状态提示 */
export function EmptyState({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("text-muted-foreground flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-sm", className)}>
      <InboxIcon className="size-6 opacity-40" />
      {text}
    </div>
  );
}
