/* 逻辑测试：词库完整性 + 出题流程（Node 原生 TS 直跑，无需构建）
   移植自 scripts/test_logic.js（vm 沙箱版），断言语义保持一致 */

export {}; // 标记为 ES 模块（顶层 await 需要）
let pass = 0, fail = 0;
function ok(cond: unknown, name: string) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; console.error("  ✘", name); }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ---- mock localStorage（import 前注入） ----
const mem: Record<string, string> = {};
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
} as Storage;

const { store } = await import("../src/lib/storage.ts");
const { DATA, PAIR_ORDER, allEntries, totalEntries, wordOf, readingOf } = await import("../src/lib/words.ts");
const { buildQuestions, entryPool, makeQuestion } = await import("../src/lib/quiz.ts");
const { diffIndex } = await import("../src/lib/pinyin.ts");
const { startRound, currentQuestion, answer, answerRow, commitQuestion, next, isFinished, finishRound } = await import("../src/lib/round.ts");

console.log("== 1. 词库数据完整性 ==");
{
  let totalEntriesCount = 0, totalWords = 0, lowOne = 0;
  for (const pair of PAIR_ORDER) {
    const p = DATA.pairs[pair];
    ok(p && p.entries.length > 0, `[${pair}] 存在条目`);
    const keySet = new Set<string>();
    let minWords = Infinity;
    for (const e of p.entries) {
      totalEntriesCount++;
      totalWords += e.words.length;
      minWords = Math.min(minWords, e.words.length);
      if (e.words.length < 2) lowOne++;
      // 同音对允许同字多读音条目（多音字），但 (字, 读音) 必须唯一
      const key = e.char + "|" + e.reading;
      assert(!keySet.has(key), `[${pair}] 重复条目 ${key}`);
      keySet.add(key);
      // options 校验
      const c = e.options.correct, w = e.options.wrong;
      assert(c.py !== w.py, `[${pair}] ${e.char} 选项相同`);
      if (pair === "l/n") {
        // l/n 组考声母：声母必须不同
        const c0 = c.py.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")[0];
        const w0 = w.py.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")[0];
        assert(c0 !== w0, `[${pair}] ${e.char} 声母相同 ${c.py}/${w.py}`);
      } else {
        assert(c.tag !== w.tag, `[${pair}] ${e.char} 选项韵母相同`);
      }
      // words 校验：目标字在词中
      for (const wd of e.words) {
        assert(wd.word.includes(e.char), `[${pair}] ${e.char} 词 ${wd.word} 不含目标字`);
      }
      // 读音归属
      const reading = e.reading;
      const nt = reading.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
      if (pair === "in/ing") assert(nt.endsWith("in") || nt.endsWith("ing"), `${e.char} ${reading} 非 in/ing`);
      if (pair === "en/eng") assert(nt.endsWith("en") || nt.endsWith("eng"), `${e.char} ${reading} 非 en/eng`);
      if (pair === "l/n") assert(nt.startsWith("l") || nt.startsWith("n"), `${e.char} ${reading} 非 l/n`);
    }
    ok(minWords >= 1, `[${pair}] 每字至少 1 词（min=${minWords}）`);
  }
  ok(totalEntriesCount >= 700, `总条目 ${totalEntriesCount} >= 700`);
  ok(totalWords >= 2200, `总词条 ${totalWords} >= 2200`);
  ok(lowOne <= 45, `词数<2 条目 ${lowOne} <= 45（多音字次读音/生僻字可接受）`);
  ok(totalEntries() === totalEntriesCount, "totalEntries() 与逐组求和一致");
}

console.log("== 2. 出题流程 ==");
// 2.1 专项出题：不重复、数量正确
const q1 = buildQuestions("pair", "in/ing", 10);
ok(q1.length === 10, "专项 in/ing 出 10 题");
// 考点粒度为 (字,读音)：多音字双读音可在同轮出现，但同一考点不重复
const keys1 = q1.map((q) => q.char + "|" + q.entry.reading);
ok(new Set(keys1).size === keys1.length, "轮内考点（字+读音）不重复");
ok(q1.every((q) => q.options.length === 2 || q.options.length === 4), "每题 2 或 4 个选项（双音对字 4 选）");
ok(q1.every((q) => q.options.some((o) => o.isCorrect)), "每题有正确选项");
ok(q1.every((q) => q.options.filter((o) => o.isCorrect).length === 1), "每题恰好 1 个正确选项");
ok(q1.every((q) => new Set(q.options.map((o) => o.py)).size === q.options.length), "选项读音不重复");

// 2.1a 多音字双读音进题池（(字,读音) 考点粒度，2026-09）
const jinPair = "in/ing";
const jinReadings = DATA.pairs[jinPair].entries.filter((e) => e.char === "尽").map((e) => e.reading);
ok(jinReadings.length === 2, `词库中「尽」含双读音条目（${jinReadings.join("/")}）`);
const poolJin = entryPool("pair", jinPair, {});
const jinInPool = jinReadings.filter((r) => poolJin.some((e) => e.char === "尽" && e.reading === r));
ok(jinInPool.length === 2, "多音字双读音均进入出题池（旧逻辑只保留第一条）");
const poolExcl = entryPool("pair", jinPair, { excludeChars: ["尽|" + jinReadings[0]] });
ok(
  poolExcl.some((e) => e.char === "尽" && e.reading === jinReadings[0]) === false &&
    poolExcl.some((e) => e.char === "尽" && e.reading === jinReadings[1]),
  "excludeChars 复合键只排除指定考点，另一读音保留",
);
store.addMastered("尽", jinPair);
const poolMastered = entryPool("pair", jinPair, {});
ok(!poolMastered.some((e) => e.char === "尽"), "已掌握仍按字整体排除（双读音同时出池）");
store.removeMastered("尽");

// 2.1b 权威读音终审回归（2026-09 Unihan 三源审计发现）：
// 摒 = bìng（四声）。pypinyin 主读 bǐng 为 1983 新华字典旧读残留，
// build_words.py 的 READING_OVERRIDES 已修正——此断言防重建词库时数据回退。
const bingEntry = DATA.pairs["in/ing"].entries.find((e) => e.char === "摒");
ok(!!bingEntry && bingEntry.reading === "bìng", "「摒」读音为 bìng（四声，现行规范唯一读音）");
ok(
  !!bingEntry && bingEntry.options.correct.py === "bìng" && bingEntry.options.wrong.py === "bìn",
  "「摒」正确/干扰项为 bìng/bìn（bìn 真实存在，非幻音）",
);
ok(bingEntry && bingEntry.words.every((w) => w.pinyin.startsWith("bìng ")), "「摒」词条拼音串同步为 bìng");

// 2.1c 双音对字（如「凝」níng）生成 4 选项：nin/ning/lin/ling
const ningEntry =
  DATA.pairs["in/ing"].entries.find((e) => e.char === "凝" && e.reading === "níng") ||
  DATA.pairs["l/n"].entries.find((e) => e.char === "凝" && e.reading === "níng");
if (ningEntry) {
  const nq = makeQuestion({ ...ningEntry, pairName: "in/ing" });
  const nset = new Set(nq.options.map((o) => o.py));
  ok(nq.options.length === 4, "「凝」为 4 选项");
  ok(["níng", "nín", "líng", "lín"].every((p) => nset.has(p)), "「凝」含 nin/ning/lin/ling");
  ok(nq.options.find((o) => o.isCorrect)!.py === "níng", "「凝」正确项为 níng");
} else {
  ok(false, "词库应含「凝」条目");
}

// 2.2 排除已掌握
store.addMastered("津", "in/ing");
const q2 = buildQuestions("pair", "in/ing", 200);
ok(!q2.some((q) => q.char === "津"), "出题池排除已掌握字「津」");

// 2.3 轮次状态机
store.setSettings({ defaultCount: 5 });
const round = startRound("pair", "in/ing", 5);
ok(round.questions.length === 5, "startRound 5 题");
let correct = 0, wrong = 0;
while (!isFinished(round)) {
  const q = currentQuestion(round)!;
  const pick = q.options[0];
  const res = answer(round, pick)!;
  if (res.correct) correct++; else wrong++;
  next(round);
}
const summary = finishRound(round)!;
ok(summary.total === 5, "summary.total = 5");
ok(summary.correct === correct && summary.wrongList.length === wrong, "复盘统计一致");
ok(store.getHistory().length === 1, "history 写入 1 条");
ok(wrong === 0 || store.getWrongBook()[summary.wrongList[0].char] !== undefined, "错题自动入错题本（全对时无错题可查）");

// 2.4 错题重练：onlyChars 过滤
const wbChars = Object.keys(store.getWrongBook());
if (wbChars.length) {
  const q3 = buildQuestions("mix", null, wbChars.length, { onlyChars: wbChars });
  ok(q3.every((q) => wbChars.includes(q.char)), "错题重练只出错题字");
}

// 2.5 已掌握后重练不再出现
store.addMastered("男", "l/n");
const q4 = buildQuestions("pair", "l/n", 200);
ok(!q4.some((q) => q.char === "男"), "已掌握字不在 l/n 出题池");

// 2.6 差异高亮定位（diffIndex 返回 in/ing 差异段下标；对应旧版 renderPy 高亮）
{
  const eJing = makeQuestion({ ...allEntries("in/ing").find((e) => e.char === "京")!, pairName: "in/ing" });
  const idx = diffIndex(eJing.correct.py, "in/ing", "ng");
  ok(idx >= 0 && eJing.correct.py.slice(idx).includes("ng"), "in/ing 差异高亮定位（" + eJing.correct.py + " @ " + idx + "）");
  const eNv = makeQuestion({ ...allEntries("l/n").find((e) => e.char === "女")!, pairName: "l/n" });
  const idxN = diffIndex(eNv.correct.py, "l/n", "n");
  ok(idxN === 0, "l/n 差异高亮定位在声母（下标 0）");
}

// 2.7 多字题：所有考察字都答错时，逐字计入错题本
{
  let hit: { entry: (typeof PAIR_ORDER)[number] extends never ? never : any; word: any } | null = null;
  outer: for (const pair of PAIR_ORDER) {
    for (const e of DATA.pairs[pair].entries) {
      for (const w of e.words) {
        const chars = Array.from(w.word);
        const pys = String(w.pinyin).trim().split(/\s+/);
        if (chars.length !== pys.length || chars.length < 2 || chars.length > 4) continue;
        const seen = new Set<string>();
        let rows = 0;
        for (let i = 0; i < chars.length; i++) {
          const c = chars[i];
          if (seen.has(c)) continue;
          const { CHAR_LOOKUP } = await import("../src/lib/words.ts");
          const hitLookup = (CHAR_LOOKUP[c] || []).some((h) => h.reading === pys[i]);
          if (c === e.char || hitLookup) { seen.add(c); rows++; }
        }
        if (rows >= 2) { hit = { entry: e, word: w }; break outer; }
      }
    }
  }
  ok(!!hit, "词库存在可出多字题的（条目, 词语）组合");
  if (hit) {
    const q = makeQuestion({ ...hit.entry, pairName: hit.entry.pair || "in/ing" } as any, hit.word);
    ok(!!q.rows && q.rows.length >= 2, "指定词语构造出多字题（" + q.rows!.map((r) => r.char).join("、") + "）");
    const round7 = startRound("mix", null, 1, { source: "t" });
    round7.questions = [q];
    q.rows!.forEach((row, ri) => answerRow(round7, ri, row.options.find((o) => !o.isCorrect)!));
    commitQuestion(round7);
    const wb = store.getWrongBook();
    ok(
      q.rows!.every((row) => wb[row.char]),
      "多字题全错 → 每个考察字都入错题本（" + q.rows!.map((r) => r.char).join("、") + "）",
    );
  }
}

console.log(`\n== 结果：${pass} 通过 / ${fail} 失败 ==`);
process.exit(fail ? 1 : 0);
