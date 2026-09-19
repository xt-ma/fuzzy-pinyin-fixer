/* 逻辑测试：mock 浏览器环境，验证词库完整性与出题流程 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; console.error("  ✘", name); }
}

// ---- mock 浏览器环境 ----
const memStore = {};
const sandbox = {
  window: {},
  document: { addEventListener() {} },
  localStorage: {
    getItem: (k) => (k in memStore ? memStore[k] : null),
    setItem: (k, v) => { memStore[k] = String(v); },
    removeItem: (k) => { delete memStore[k]; },
  },
  console,
  Date,
  Math,
  setTimeout,
  clearTimeout,
  JSON,
  Object,
  Array,
  String,
  Number,
  Set,
  Map,
  RegExp,
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// ---- 加载 ----
function load(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), "utf-8");
  vm.runInContext(code, sandbox, { filename: rel });
}
load("data/words.js");
load("js/store.js");
load("js/quiz.js");

const Quiz = sandbox.Quiz;
const Store = sandbox.Store;

console.log("== 1. 词库数据完整性 ==");
const DATA = Quiz.DATA;
let totalEntries = 0, totalWords = 0, lowOne = 0;
for (const pair of Quiz.PAIR_ORDER) {
  const p = DATA.pairs[pair];
  ok(p && p.entries.length > 0, `[${pair}] 存在条目`);
  const keySet = new Set();
  let minWords = Infinity;
  for (const e of p.entries) {
    totalEntries++;
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
ok(totalEntries >= 700, `总条目 ${totalEntries} >= 700`);
ok(totalWords >= 2200, `总词条 ${totalWords} >= 2200`);
ok(lowOne <= 45, `词数<2 条目 ${lowOne} <= 45（多音字次读音/生僻字可接受）`);

console.log("== 2. 出题流程 ==");
// 2.1 专项出题：不重复、数量正确
const q1 = Quiz.buildQuestions("pair", "in/ing", 10);
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
const jinReadings = Quiz.DATA.pairs[jinPair].entries
  .filter((e) => e.char === "尽").map((e) => e.reading);
ok(jinReadings.length === 2, `词库中「尽」含双读音条目（${jinReadings.join("/")}）`);
const poolJin = Quiz.entryPool("pair", jinPair, {});
const jinInPool = jinReadings.filter((r) => poolJin.some((e) => e.char === "尽" && e.reading === r));
ok(jinInPool.length === 2, "多音字双读音均进入出题池（旧逻辑只保留第一条）");
const poolExcl = Quiz.entryPool("pair", jinPair, { excludeChars: ["尽|" + jinReadings[0]] });
ok(poolExcl.some((e) => e.char === "尽" && e.reading === jinReadings[0]) === false
   && poolExcl.some((e) => e.char === "尽" && e.reading === jinReadings[1]),
   "excludeChars 复合键只排除指定考点，另一读音保留");
Store.addMastered("尽", jinPair);
const poolMastered = Quiz.entryPool("pair", jinPair, {});
ok(!poolMastered.some((e) => e.char === "尽"), "已掌握仍按字整体排除（双读音同时出池）");
Store.removeMastered("尽", jinPair);

// 2.1b 双音对字（如「凝」níng）生成 4 选项：nin/ning/lin/ling
const ningEntry = Quiz.DATA.pairs["in/ing"].entries.find((e) => e.char === "凝" && e.reading === "níng")
  || Quiz.DATA.pairs["l/n"].entries.find((e) => e.char === "凝" && e.reading === "níng");
if (ningEntry) {
  const nq = Quiz.makeQuestion(ningEntry);
  const nset = new Set(nq.options.map((o) => o.py));
  ok(nq.options.length === 4, "「凝」为 4 选项");
  ok(["níng", "nín", "líng", "lín"].every((p) => nset.has(p)), "「凝」含 nin/ning/lin/ling");
  ok(nq.options.find((o) => o.isCorrect).py === "níng", "「凝」正确项为 níng");
} else {
  ok(false, "词库应含「凝」条目");
}

// 2.2 排除已掌握
Store.addMastered("津", "in/ing");
const q2 = Quiz.buildQuestions("pair", "in/ing", 200);
ok(!q2.some((q) => q.char === "津"), "出题池排除已掌握字「津」");

// 2.3 轮次状态机
Store.setSettings({ defaultCount: 5 });
const round = Quiz.startRound("pair", "in/ing", 5);
ok(round.questions.length === 5, "startRound 5 题");
let correct = 0, wrong = 0;
while (!Quiz.isFinished()) {
  const q = Quiz.currentQuestion();
  const pick = q.options[0];
  const res = Quiz.answer(pick);
  if (res.correct) correct++; else wrong++;
  Quiz.next();
}
const summary = Quiz.finishRound();
ok(summary.total === 5, "summary.total = 5");
ok(summary.correct === correct && summary.wrongList.length === wrong, "复盘统计一致");
ok(Store.getHistory().length === 1, "history 写入 1 条");
ok(Store.getWrongBook()[summary.wrongList[0].char] !== undefined || wrong === 0, "错题自动入错题本");

// 2.4 错题重练：onlyChars 过滤
const wbChars = Object.keys(Store.getWrongBook());
if (wbChars.length) {
  const q3 = Quiz.buildQuestions("mix", null, wbChars.length, { onlyChars: wbChars });
  ok(q3.every((q) => wbChars.includes(q.char)), "错题重练只出错题字");
}

// 2.5 已掌握后重练不再出现
Store.addMastered("男", "l/n");
const q4 = Quiz.buildQuestions("pair", "l/n", 200);
ok(!q4.some((q) => q.char === "男"), "已掌握字不在 l/n 出题池");

// 2.6 选项渲染（HTML 转义 + 差异高亮）
const e1 = Quiz.makeQuestion(Quiz.allEntries("in/ing").find((e) => e.char === "京"));
ok(Quiz.renderPy(e1.correct.py, "in/ing", "ng").includes('<span class="diff">'), "in/ing 差异高亮渲染");

// 2.7 多字题：所有考察字都答错时，逐字计入错题本（如「呻吟」两字都错 → 都进错题本）
{
  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    Quiz.startRound("mix", null, 20);
    while (!Quiz.isFinished()) {
      const q = Quiz.currentQuestion();
      if (q.rows && q.rows.length >= 2) { target = q; break; }
      // 非目标题：答对跳过（答对不产生错题干扰）
      if (q.rows) {
        q.rows.forEach((row, ri) => Quiz.answerRow(ri, row.options.find((o) => o.isCorrect)));
        Quiz.commitQuestion();
      } else {
        Quiz.answer(q.options.find((o) => o.isCorrect));
      }
      Quiz.next();
    }
  }
  if (target) {
    target.rows.forEach((row, ri) => Quiz.answerRow(ri, row.options.find((o) => !o.isCorrect)));
    Quiz.commitQuestion();
    const wb = Store.getWrongBook();
    ok(
      target.rows.every((row) => wb[row.char]),
      "多字题全错 → 每个考察字都入错题本（" + target.rows.map((r) => r.char).join("、") + "）"
    );
  } else {
    ok(false, "50 轮内应出现多字题");
  }
}

console.log(`\n== 结果：${pass} 通过 / ${fail} 失败 ==`);
process.exit(fail ? 1 : 0);
