import { useEffect, useState } from "react";
import {
  BarChart3Icon,
  BookCheckIcon,
  BookXIcon,
  DumbbellIcon,
  SettingsIcon,
} from "lucide-react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useUiStore, type View } from "@/stores/ui";
import { useAppStore } from "@/stores/app";
import { Sync } from "@/lib/sync";

const NAV: { view: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { view: "home", label: "练习", icon: DumbbellIcon },
  { view: "stats", label: "统计", icon: BarChart3Icon },
  { view: "mastered", label: "已掌握", icon: BookCheckIcon },
  { view: "wrongbook", label: "错题本", icon: BookXIcon },
  { view: "settings", label: "设置", icon: SettingsIcon },
];

function NavItems({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const view = useUiStore((s) => s.view);
  const navigate = useUiStore((s) => s.navigate);
  return (
    <nav aria-label="主导航" className={cn("flex gap-1", orientation === "vertical" ? "flex-col" : "items-center overflow-x-auto")}>
      {NAV.map((item) => {
        const active = view === item.view;
        const Icon = item.icon;
        return (
          <button
            key={item.view}
            onClick={() => navigate(item.view)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              orientation === "vertical" && "w-full justify-start",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

/** 断点监听：≥lg 走桌面双栏（侧栏可调宽），否则单列（顶栏导航）。
    只渲染一份 children——避免同一组件树实例化两次（状态/动画各一份）。 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(min-width: 1024px)").matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

function VersionTag() {
  const version = useAppStore((s) => s.version);
  const st = Sync.status();
  return (
    <span className="text-muted-foreground hidden text-xs whitespace-nowrap sm:inline">
      v2.0 · 本地数据{st.enabled && st.key ? " · 云同步" : ""} · r{version}
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  return (
    <div className="flex h-dvh flex-col">
      <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-40 border-b backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
          <button
            onClick={() => useUiStore.getState().navigate("home")}
            className="flex min-h-11 items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg font-bold">拼</span>
            <span className="font-semibold">模糊音克星</span>
          </button>
          {!isDesktop && (
            <div>
              <NavItems orientation="horizontal" />
            </div>
          )}
          <div className="ml-auto flex items-center gap-3">
            <VersionTag />
          </div>
        </div>
      </header>

      {isDesktop ? (
        <div className="mx-auto flex w-full max-w-[1400px] min-h-0 flex-1">
          <ResizablePanelGroup orientation="horizontal" className="flex-1">
            <ResizablePanel defaultSize="17%" minSize="13%" maxSize="28%">
              <aside className="h-full overflow-y-auto border-r p-3">
                <NavItems orientation="vertical" />
              </aside>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel>
              <main className="h-full overflow-y-auto px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
                {children}
              </main>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <main className="mx-auto min-h-0 w-full max-w-[1400px] flex-1 overflow-y-auto px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
      )}
    </div>
  );
}
