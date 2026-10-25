import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUiStore } from "@/stores/ui";

/** 危险 Html 渲染（仅允许 <b> 粗体，与旧版文案格式一致） */
function richText(html: string) {
  const parts = html.split(/(<b>|<\/b>)/);
  let bold = false;
  return parts.map((p, i) => {
    if (p === "<b>") { bold = true; return null; }
    if (p === "</b>") { bold = false; return null; }
    return bold ? <b key={i}>{p}</b> : <span key={i}>{p}</span>;
  });
}

/** 全局确认弹窗宿主：ui.confirm() 的 Promise 由这里 resolve */
export function ConfirmHost() {
  const req = useUiStore((s) => s.confirmReq);
  const resolve = useUiStore((s) => s.resolveConfirm);
  return (
    <AlertDialog open={!!req} onOpenChange={(open) => !open && resolve(false)}>
      {req && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{req.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>{richText(req.html)}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolve(false)}>取消</AlertDialogCancel>
            <AlertDialogAction
              className={req.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
              onClick={() => resolve(true)}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
