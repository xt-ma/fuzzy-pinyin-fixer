import { cn } from "@/lib/utils";
import { diffIndex } from "@/lib/pinyin";

/** 拼音文本：差异部分加粗高亮（in/ing → n/ng；l/n → 声母） */
export function PyText({
  py,
  pairName,
  diff,
  className,
}: {
  py: string;
  /** 音对（l/n 走声母定位；韵母对走结尾 n/ng 定位） */
  pairName: string;
  /** 差异段（"n" / "ng" / "l" / "n"） */
  diff: string;
  className?: string;
}) {
  const idx = diffIndex(py, pairName, diff);
  if (idx < 0) return <span className={className}>{py}</span>;
  return (
    <span className={className}>
      {py.slice(0, idx)}
      <span className="py-diff">{py.slice(idx, idx + diff.length)}</span>
      {py.slice(idx + diff.length)}
    </span>
  );
}
