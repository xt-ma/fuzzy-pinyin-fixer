import { Badge } from "@/components/ui/badge";
import { cn, pairTextClass } from "@/lib/utils";
import { pairMeta } from "@/lib/words";

/** 音对徽章（按音对着色） */
export function PairBadge({ pair, className }: { pair: string; className?: string }) {
  const meta = pairMeta(pair);
  return (
    <Badge variant="outline" className={cn(pairTextClass(pair), "border-current/25", className)}>
      {meta.label}
    </Badge>
  );
}
