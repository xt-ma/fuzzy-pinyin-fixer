import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeftIcon,
  BookXIcon,
  CheckIcon,
  ChevronRightIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { PyText } from "@/components/app/py-text";
import { PairBadge } from "@/components/app/pair-badge";
import { cn } from "@/lib/utils";
import { diffKeyOf, tagLabel } from "@/lib/pinyin";
import { pairMeta } from "@/lib/words";
import { tts } from "@/lib/tts";
import type { Question, QuestionRow, QuizOption } from "@/lib/quiz";
import { useQuizStore, isQuestionAnswered, type Round } from "@/stores/quiz";
import { useAppStore } from "@/stores/app";
import { useUiStore } from "@/stores/ui";

/* ---------------- 作答反馈文案 ---------------- */

function explainCorrect(pairName: string, tag: string): React.ReactNode {
  if (pairName === "l/n") {
    return tag === "l" ? (
      <>差异点在声母 <b>l / n</b>：<b>l</b> 是边音（舌尖抵住上齿龈，气流从舌两侧通过），<b>n</b> 是鼻音（气流从鼻腔通过）。</>
    ) : (
      <>差异点在声母 <b>n / l</b>：<b>n</b> 是鼻音（气流从鼻腔通过），<b>l</b> 是边音（气流从舌两侧通过）。</>
    );
  }
  const pre = tag === "in" || tag === "en";
  return pre ? (
    <>差异点在韵母 <b>n / ng</b>：<b>{tag}</b> 是前鼻音（舌尖抵住上齿龈），{tag}g 是后鼻音（舌根抬起）。</>
  ) : (
    <>差异点在韵母 <b>n / ng</b>：<b>{tag}</b> 是后鼻音（舌根抬起），{tag.slice(0, -1)} 是前鼻音（舌尖抵住上齿龈）。</>
  );
}

function Feedback({ tone, title, children }: { tone: "success" | "destructive"; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      role="alert"
      className={cn(
        "mt-5 flex items-start gap-3 rounded-lg border p-4 text-sm leading-relaxed",
        tone === "success" ? "border-success/30 bg-success/10 text-foreground" : "border-destructive/30 bg-destructive/10 text-foreground",
      )}
    >
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold", tone === "success" ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground")}>
        {tone === "success" ? "✓" : "✕"}
      </span>
      <div>
        <b>{title}</b>
        {children && <span> {children}</span>}
      </div>
    </motion.div>
  );
}

/* ---------------- 选项按钮 ---------------- */

interface OptionState {
  /** 正确项（锁定态绿显） */
  isCorrect: boolean;
  /** 用户最终选择（锁定态红显） */
  isPicked: boolean;
  /** 多行题中间态：当前选择（蓝显，未锁定） */
  isPending?: boolean;
}

function OptionButton({
  option, pairName, diff, state, locked, hotkey, onClick,
}: {
  option: QuizOption;
  pairName: string;
  diff: string;
  state: OptionState;
  locked: boolean;
  hotkey?: number;
  onClick: () => void;
}) {
  const wrong = state.isPicked && !state.isCorrect;
  return (
    <motion.button
      disabled={locked}
      onClick={onClick}
      whileTap={locked ? undefined : { scale: 0.97 }}
      animate={
        wrong
          ? { x: [0, -6, 6, -4, 4, 0] } // 答错抖动
          : state.isCorrect && locked
            ? { scale: [1, 1.04, 1] } // 正确项弹跳
            : {}
      }
      transition={{ duration: 0.35 }}
      className={cn(
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 group flex min-h-11 items-center justify-between gap-2 rounded-lg border px-4 py-3 text-left transition-colors outline-none",
        "text-base font-medium",
        !locked && "hover:border-primary/50 hover:bg-accent/60",
        state.isPending && !locked && "border-primary bg-primary/10",
        locked && !state.isCorrect && !wrong && "opacity-50",
        state.isCorrect && locked && "border-success bg-success/15",
        wrong && "border-destructive bg-destructive/15",
        !state.isCorrect && !state.isPending && !wrong && "bg-card",
      )}
    >
      <PyText py={option.py} pairName={pairName} diff={diff} className="text-lg tracking-wide" />
      <span className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">{tagLabel(pairName, option.tag)}</span>
        {hotkey !== undefined && <span className="kbd">{hotkey}</span>}
      </span>
    </motion.button>
  );
}

/* ---------------- 单行 / 多行选项区 ---------------- */

function SingleOptions({ q, locked }: { q: Question; locked: boolean }) {
  const submit = useQuizStore((s) => s.submit);
  const answered = !!q.answered;
  return (
    <div className={cn("mt-2 grid gap-3", q.options.length === 4 ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
      {q.options.map((o, i) => {
        const state: OptionState = {
          isCorrect: o.isCorrect,
          isPicked: answered && q.pick === o,
        };
        return (
          <OptionButton
            key={o.py}
            option={o}
            pairName={q.diffVowel || q.pair}
            diff={diffKeyOf(q.diffVowel || q.pair, o.tag)}
            state={state}
            locked={locked}
            hotkey={i + 1}
            onClick={() => submit(0, i)}
          />
        );
      })}
    </div>
  );
}

function RowOptions({ row, rowIndex, q, revealedChars }: {
  row: QuestionRow;
  rowIndex: number;
  q: Question;
  revealedChars?: Set<string>;
}) {
  const submit = useQuizStore((s) => s.submit);
  const committed = isQuestionAnswered(q);
  const results = q.rowResults || [];
  const picks = q.rowPicks || [];
  const rowLocked = committed || !!q.masteredRevealed;
  const revealed = revealedChars?.has(row.char);
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3 sm:w-24 sm:shrink-0">
        <span className="bg-muted text-foreground flex size-10 items-center justify-center rounded-lg text-xl font-semibold">{row.char}</span>
        {committed && (results[rowIndex] ? <CheckIcon className="text-success size-4" /> : <XIcon className="text-destructive size-4" />)}
      </div>
      <div className={cn("grid flex-1 gap-2", row.options.length === 4 ? "sm:grid-cols-2" : "grid-cols-2")}>
        {row.options.map((o, i) => {
          const state: OptionState = {
            // 已提交：正确项全揭示；已掌握跳过态：仅揭示被标记字的正确项
            isCorrect: committed ? o.isCorrect : !!revealed && o.isCorrect,
            isPicked: committed && picks[rowIndex] === o && !o.isCorrect,
            isPending: !committed && picks[rowIndex] === o,
          };
          return (
            <OptionButton
              key={o.py}
              option={o}
              pairName={row.diffVowel || row.pair}
              diff={diffKeyOf(row.diffVowel || row.pair, o.tag)}
              state={state}
              locked={rowLocked}
              hotkey={i + 1}
              onClick={() => submit(rowIndex, i)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 题干词（目标字高亮 + 作答后重听按钮） ---------------- */

function QuizWord({ q, answered }: { q: Question; answered: boolean }) {
  const [replayKey, setReplayKey] = useState(0);
  const text = q.word ? q.word.word : q.char;
  const chars = Array.from(text);
  const targetSet = useMemo(
    () => new Set(q.rows ? q.rows.map((r) => r.char) : [q.char]),
    [q],
  );
  const usable = tts.supported();
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      <motion.div
        key={q.char + (q.word?.word || "")}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="flex items-baseline justify-center"
      >
        <span className="text-5xl font-bold tracking-[0.08em] sm:text-6xl">
          {chars.map((c, i) => (
            <span key={i} className={targetSet.has(c) ? "text-primary" : undefined}>{c}</span>
          ))}
        </span>
      </motion.div>
      {answered && usable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label="重听朗读" onClick={() => { tts.speak(text, { ignoreSwitch: true }); setReplayKey((k) => k + 1); }}>
              <Volume2Icon key={replayKey} className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>重听朗读</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/* ---------------- 已掌握多选弹窗 ---------------- */

function MasteredPicker({ q, open, onOpenChange }: { q: Question; open: boolean; onOpenChange: (v: boolean) => void }) {
  const apply = useQuizStore((s) => s.applyMasteredPicker);
  const mastered = useAppStore((s) => s.mastered);
  const rows = q.rows || [];
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.filter((r) => mastered[r.char]).map((r) => r.char)));
  useEffect(() => {
    if (open) setPicked(new Set(rows.filter((r) => mastered[r.char]).map((r) => r.char)));
  }, [open, mastered, rows]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>标记已掌握</DialogTitle>
          <DialogDescription>勾选已认识的字（不影响对错判定，仅决定后续是否继续出题）</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {rows.map((row) => (
            <label key={row.char} className="hover:bg-accent flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2">
              <Checkbox
                checked={picked.has(row.char)}
                onCheckedChange={(v) =>
                  setPicked((prev) => {
                    const n = new Set(prev);
                    if (v) n.add(row.char); else n.delete(row.char);
                    return n;
                  })
                }
              />
              <span className="text-xl font-semibold">{row.char}</span>
              <span className="text-muted-foreground font-mono text-sm">{row.correct.py}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => { apply(Array.from(picked)); onOpenChange(false); }}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- 主视图 ---------------- */

export function QuizView() {
  const round = useQuizStore((s) => s.round);
  const tick = useQuizStore((s) => s.tick);
  const quiz = useQuizStore.getState();
  const navigate = useUiStore((s) => s.navigate);
  const confirm = useUiStore((s) => s.confirm);
  const mastered = useAppStore((s) => s.mastered);
  const [pickerOpen, setPickerOpen] = useState(false);

  const q = round ? quiz.current() : null;
  const answered = isQuestionAnswered(q);
  const revealedChars = useMemo(
    () => (q?.masteredRevealed ? new Set(q.masteredRevealChars || []) : undefined),
    [q, tick],
  );

  /* 无轮次（异常直入）→ 回首页 */
  useEffect(() => {
    if (!round) navigate("home");
  }, [round, navigate]);

  /* 键盘：数字键作答（多行题作用于第一个未答行）/ ← 回溯 */
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        useQuizStore.getState().prev();
        return;
      }
      if (!/^[1-4]$/.test(ev.key)) return;
      const r = useQuizStore.getState().round;
      if (!r) return;
      const cur = useQuizStore.getState().current();
      if (!cur) return;
      const idx = +ev.key - 1;
      if (cur.rows) {
        const results = cur.rowResults || [];
        let ri = -1;
        for (let i = 0; i < cur.rows.length; i++) {
          if (results[i] === undefined) { ri = i; break; }
        }
        if (ri < 0 || idx >= cur.rows[ri].options.length) return;
        useQuizStore.getState().submit(ri, idx);
      } else {
        if (idx >= cur.options.length) return;
        useQuizStore.getState().submit(0, idx);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!round || !q) return null;

  const infinite = round.infinite;
  const meta = round.mode === "pair" ? pairMeta(round.pair) : null;
  const answeredCount = round.correctCount + round.wrongList.length;
  const progressPct = infinite ? 100 : Math.round((round.index / round.questions.length) * 100);
  const isTouch = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const allChars = q.rows ? q.rows.map((r) => r.char) : [q.char];
  const markedCount = allChars.filter((c) => mastered[c]).length;
  const ttsUsable = tts.supported();
  const ttsOn = tts.enabled();

  const hint = q.isWordQuestion
    ? q.rows
      ? `词语题 · 本词含 ${q.rows.length} 个考察字`
      : `词语题 · 目标字「${q.char}」`
    : `单字题 · 「${q.char}」`;

  const keyHint = q.rows
    ? isTouch
      ? "多字题：请逐行点击选项作答"
      : "多字题：请逐行选择，按数字键作答当前行"
    : infinite
      ? "无限模式：答对自动下一题，随时点「结束本轮」查看复盘"
      : (isTouch ? "点击选项作答" : "键盘：按数字键作答") +
        (round.index > 0 ? (isTouch ? "，点左下角回看上一题" : "，← 回看上一题") : "");

  const quit = async () => {
    if (round.infinite) {
      const done = round.correctCount + round.wrongList.length;
      const go = await confirm("结束本轮", `已答 ${done} 题（答对 ${round.correctCount}），确定结束并查看复盘吗？`);
      if (go) useQuizStore.getState().finish();
    } else {
      navigate("home");
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={quit}>
          <ArrowLeftIcon /> {infinite ? "结束本轮" : "返回"}
        </Button>
        <Button variant="outline" disabled={round.index <= 0} onClick={() => quiz.prev()}>
          <ChevronRightIcon className="rotate-180" /> 上一题
        </Button>
        {round.index < round.maxIndex && (
          <Button variant="secondary" onClick={() => quiz.resume()}>
            继续作答 <ChevronRightIcon />
          </Button>
        )}
        <div className="order-last w-full sm:order-none sm:ml-4 sm:flex-1">
          <div className="text-muted-foreground mb-1 flex justify-between text-xs">
            <span>{round.mode === "pair" ? `${meta?.label} 专项` : "综合随机"}</span>
            <span className="tabular-nums">
              {infinite ? `无限模式 · 已答 ${round.index + 1} 题` : `${round.index + 1} / ${round.questions.length}`}
            </span>
          </div>
          <Progress value={progressPct} indeterminate={infinite} aria-label="答题进度" />
        </div>
        {round.mode === "pair" ? <PairBadge pair={round.pair || ""} /> : <Badge>综合</Badge>}
        {ttsUsable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                aria-label="切换作答朗读"
                aria-pressed={ttsOn}
                onClick={() => useQuizStore.getState().toggleTts()}
              >
                {ttsOn ? <Volume2Icon /> : <VolumeXIcon className="text-muted-foreground" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{ttsOn ? "朗读已开启" : "朗读已关闭"}</TooltipContent>
          </Tooltip>
        )}
        <Button
          variant={markedCount ? "success" : "outline"}
          onClick={() => (q.rows ? setPickerOpen(true) : quiz.toggleMasteredSingle())}
        >
          <CheckIcon /> 已掌握{markedCount ? ` ✓ ${allChars.length > 1 ? `${markedCount}/${allChars.length}` : ""}` : ""}
        </Button>
      </div>

      {/* 答题区（桌面 xl：答题卡 + 本轮概览侧栏，可调宽） */}
      <div className="mt-4">
        <div className="hidden xl:block">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel minSize="55%" defaultSize="68%">
              <QuizCard q={q} answered={answered} revealedChars={revealedChars} hint={hint} navigate={navigate} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel minSize="20%" defaultSize="32%">
              <RoundPanel round={round} answeredCount={answeredCount} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <div className="xl:hidden">
          <QuizCard q={q} answered={answered} revealedChars={revealedChars} hint={hint} navigate={navigate} />
        </div>
      </div>

      <div className="text-muted-foreground mt-4 text-center text-xs">{keyHint}</div>
      {q.rows && <MasteredPicker q={q} open={pickerOpen} onOpenChange={setPickerOpen} />}
    </div>
  );
}

/* ---------------- 答题卡 ---------------- */

function QuizCard({
  q, answered, revealedChars, hint, navigate,
}: {
  q: Question;
  answered: boolean;
  revealedChars?: Set<string>;
  hint: string;
  navigate: (v: "home" | "quiz" | "result" | "stats" | "mastered" | "wrongbook" | "settings") => void;
}) {
  const quiz = useQuizStore.getState();
  const locked = answered || !!q.masteredRevealed;
  const results = q.rowResults || [];
  const wrongRowsCount = q.rows ? q.rows.filter((_, i) => !results[i]).length : 0;

  return (
    <Card className="py-6">
      <CardContent className="px-5 sm:px-8">
        <div className="text-muted-foreground text-center text-xs">{hint}</div>
        <QuizWord q={q} answered={answered} />
        <div className="text-muted-foreground mt-4 text-center text-sm">
          {q.rows ? "请为每个字选择正确读音" : `请选择「${q.char}」的正确读音`}
        </div>

        {q.rows ? (
          <div className="mt-5 space-y-3">
            {q.rows.map((row, ri) => (
              <RowOptions key={row.char + ri} row={row} rowIndex={ri} q={q} revealedChars={revealedChars} />
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <SingleOptions q={q} locked={locked} />
          </div>
        )}

        {/* 反馈 */}
        <AnimatePresence>
          {answered && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {q.rows ? (
                wrongRowsCount === 0 ? (
                  <Feedback tone="success" title="回答正确！">全部 {q.rows.length} 个字读音都对了。</Feedback>
                ) : (
                  <Feedback tone="destructive" title={`有 ${wrongRowsCount} 个字答错`}>正确读音已标出，答错的字已自动加入错题本。</Feedback>
                )
              ) : q.pick?.isCorrect ? (
                <Feedback tone="success" title="回答正确！">{explainCorrect(q.pair, q.correct.tag)}</Feedback>
              ) : (
                <Feedback tone="destructive" title="回答错误">
                  正确读音为 <b className="text-lg">{q.correct.py}</b>（{tagLabel(q.pair, q.correct.tag)}）。该字已自动加入错题本。
                </Feedback>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 动作行 */}
        {answered && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex flex-wrap justify-center gap-3"
          >
            {(q.rows ? wrongRowsCount === 0 : q.pick?.isCorrect) ? (
              <Button variant="ghost" onClick={() => quiz.skip()}>
                <SkipForwardIcon /> 跳过
              </Button>
            ) : (
              <>
                <Button variant="default" onClick={() => navigate("wrongbook")}>
                  <BookXIcon /> 查看错题本
                </Button>
                <Button variant="outline" onClick={() => quiz.next()}>
                  继续下一题 <ChevronRightIcon />
                </Button>
              </>
            )}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- 本轮概览侧栏 ---------------- */

function RoundPanel({ round, answeredCount }: { round: Round; answeredCount: number }) {
  return (
    <Card className="h-full py-5">
      <CardContent className="px-5">
        <div className="text-sm font-medium">本轮概览</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border p-3">
            <div className="text-success text-xl font-semibold tabular-nums">{round.correctCount}</div>
            <div className="text-muted-foreground mt-1 text-xs">答对</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-destructive text-xl font-semibold tabular-nums">{round.wrongList.length}</div>
            <div className="text-muted-foreground mt-1 text-xs">答错</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xl font-semibold tabular-nums">
              {answeredCount ? Math.round((round.correctCount / answeredCount) * 100) : 0}%
            </div>
            <div className="text-muted-foreground mt-1 text-xs">正确率</div>
          </div>
        </div>
        <div className="mt-4 text-muted-foreground text-xs font-medium">最近错题</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {round.wrongList.length ? (
            round.wrongList.slice(-12).reverse().map((w, i) => (
              <span key={i} className="border-destructive/40 text-destructive rounded-md border px-2 py-1 text-xs">
                {w.char} {w.correctPy}
              </span>
            ))
          ) : (
            <span className="text-muted-foreground text-xs">暂无错题，继续保持</span>
          )}
        </div>
        <div className="text-muted-foreground mt-4 text-xs">
          {round.infinite ? "无限模式：随时点「结束本轮」查看复盘" : `共 ${round.questions.length} 题 · 结束后自动复盘`}
        </div>
      </CardContent>
    </Card>
  );
}
