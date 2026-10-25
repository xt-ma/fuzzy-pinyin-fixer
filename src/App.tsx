import { useEffect } from "react";
import { MotionConfig, motion } from "motion/react";

import { AppShell } from "@/components/app/app-shell";
import { ConfirmHost } from "@/components/app/confirm-host";
import { Toaster } from "@/components/app/toaster";
import { HomeView } from "@/views/home";
import { QuizView } from "@/views/quiz";
import { ResultView } from "@/views/result";
import { StatsView } from "@/views/stats";
import { MasteredView } from "@/views/mastered";
import { WrongbookView } from "@/views/wrongbook";
import { SettingsView } from "@/views/settings";
import { useUiStore } from "@/stores/ui";
import { useQuizStore } from "@/stores/quiz";
import { Sync } from "@/lib/sync";
import { tts } from "@/lib/tts";

const VIEWS: Record<string, React.ComponentType> = {
  home: HomeView,
  quiz: QuizView,
  result: ResultView,
  stats: StatsView,
  mastered: MasteredView,
  wrongbook: WrongbookView,
  settings: SettingsView,
};

export default function App() {
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  const toast = useUiStore((s) => s.toast);

  useEffect(() => {
    // 深链接初始化 + 浏览器后退跟随 hash
    useUiStore.getState().initFromHash();
    const onHash = () => useUiStore.getState().initFromHash();
    window.addEventListener("hashchange", onHash);

    // 云同步启动（已配置时静默拉取）
    Sync.init();

    // TTS 引擎无响应（Firefox 等未实现语音合成）：提示并停用功能
    tts.onDegraded = () => {
      toast("当前浏览器语音引擎不可用，朗读已停用；建议改用 Chrome 或系统自带浏览器");
    };
    return () => window.removeEventListener("hashchange", onHash);
  }, [toast]);

  // 离开答题页：停止残留朗读与待切题计时（视图切换由本 effect 守卫）
  useEffect(() => {
    if (view !== "quiz") useQuizStore.getState().onLeave();
  }, [view]);

  const ViewComp = VIEWS[view] ?? HomeView;

  return (
    <MotionConfig reducedMotion="user">
      <AppShell>
        {/* 只做入场动画：退出动画在后台标签页会因 rAF 冻结而滞留旧视图（叠加渲染），故不设 exit */}
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="mx-auto w-full max-w-5xl"
        >
          <ViewComp />
        </motion.div>
      </AppShell>
      <Toaster />
      <ConfirmHost />
    </MotionConfig>
  );
}
