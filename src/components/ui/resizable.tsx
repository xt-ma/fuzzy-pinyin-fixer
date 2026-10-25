import { GripVerticalIcon } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/utils";

/**
 * 可调布局面板（react-resizable-panels v4 API）
 * 注意：v4 中尺寸 number=像素、string=百分比；本项目统一用百分比字符串。
 */
function ResizablePanelGroup({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      orientation={orientation}
      className={cn("flex h-full w-full data-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  );
}

function ResizablePanel(props: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" className="min-w-0 min-h-0" {...props} />;
}

function ResizableHandle({
  className,
  withHandle,
  ...props
}: React.ComponentProps<typeof Separator> & { withHandle?: boolean }) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 relative z-10 flex w-px shrink-0 items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1.5 after:-translate-x-1/2 hover:after:bg-transparent data-[orientation=vertical]:after:h-1.5 data-[orientation=vertical]:after:w-auto data-[orientation=vertical]:after:left-0 data-[orientation=vertical]:after:top-1/2 data-[orientation=vertical]:after:-translate-y-1/2 transition-colors cursor-col-resize data-[orientation=vertical]:cursor-row-resize",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-20 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </Separator>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
