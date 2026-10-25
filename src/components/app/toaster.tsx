import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2Icon } from "lucide-react";

import { useUiStore } from "@/stores/ui";

/** 全局 toast（Motion 动画；store 驱动，替代旧版 #toast 单例） */
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(60px+env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="bg-foreground text-background pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg"
          >
            <CheckCircle2Icon className="size-4 shrink-0 opacity-80" />
            <span>{t.msg}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
