/* ============================================================
   模糊音克星 · 题目生成与轮次状态机
   数据源：window.WORDS_DATA（data/words.js 由构建脚本生成）
   ============================================================ */
(function () {
  "use strict";

  const DATA = window.WORDS_DATA || { pairs: {} };
  const PAIR_ORDER = ["in/ing", "en/eng", "l/n"];
  const MAX_ROWS = 4; // 一道词题最多同时考察的字数（含目标字）

  /* 词库查找表：char -> [{reading, pair, entry}]，用于识别词语中的其他可考字（多音字按词内实际读音匹配） */
  const CHAR_LOOKUP = (function () {
    const m = {};
    PAIR_ORDER.forEach((p) => {
      const entries = (DATA.pairs[p] || {}).entries || [];
      entries.forEach((e) => {
        (m[e.char] = m[e.char] || []).push({ reading: e.reading, pair: p, entry: e });
      });
    });
    return m;
  })();

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* 所有条目（扁平） */
  function allEntries(pair) {
    const p = DATA.pairs[pair];
    if (!p) return [];
    return p.entries;
  }

  /* 条目池构建（公共）：按模式取条目 + 排除已掌握 + onlyChars/excludeChars 过滤 + 按 (字,读音) 去重
     返回条目数组（已混入 pairName 字段）。
     去重粒度为 (char, reading)：多音字的不同读音是不同考点（如 尽 jǐn/jìn），均可出题；
     已掌握仍按字整体排除（Store.addMastered 按字标记）。
     excludeChars 为 char|reading 复合键数组（无限模式补题排除本轮已出考点）。 */
  function entryPool(mode, pair, opts) {
    opts = opts || {};
    const mastered = Store.getMastered();
    let pool = [];

    if (mode === "pair") {
      pool = allEntries(pair).map((e) => Object.assign({}, e, { pairName: pair }));
    } else {
      PAIR_ORDER.forEach((p) => {
        pool = pool.concat(allEntries(p).map((e) => Object.assign({}, e, { pairName: p })));
      });
    }

    // 排除已掌握字
    pool = pool.filter((e) => !mastered[e.char]);

    // 若指定了来源字集（错题重练/单字重练），进一步过滤
    if (opts.onlyChars) {
      const set = new Set(opts.onlyChars);
      pool = pool.filter((e) => set.has(e.char));
    }
    // 排除指定考点（补题时不再重复本轮已出过的 字+读音）
    if (opts.excludeChars) {
      const set = new Set(opts.excludeChars);
      pool = pool.filter((e) => !set.has(e.char + "|" + e.reading));
    }

    // 同一轮内不重复同一考点：按 (字,读音) 去重
    const seen = new Set();
    const dedup = [];
    for (const e of pool) {
      const key = e.char + "|" + e.reading;
      if (!seen.has(key)) {
        seen.add(key);
        dedup.push(e);
      }
    }
    return dedup;
  }

  /* 生成题目：mode = 'pair' 专项 | 'mix' 综合；pair = 'in/ing'|'en/eng'|'l/n'|null
     FSRS 开关开启 → 到期复习队列优先 + 随机补充（fromFSRS=true）；
     关闭 → 纯随机旧逻辑（可回滚） */
  function buildQuestions(mode, pair, count, opts) {
    opts = opts || {};
    if (Store.getSettings().enableFSRS && window.FSRS) {
      return buildQuestionsFSRS(mode, pair, count, opts);
    }
    return buildQuestionsRandom(mode, pair, count, opts);
  }

  /* [deprecated] 纯随机出题（旧逻辑，FSRS 关闭时回滚用，保留勿删） */
  function buildQuestionsRandom(mode, pair, count, opts) {
    const dedup = entryPool(mode, pair, opts);
    const questions = shuffle(dedup)
      .slice(0, count)
      .map((e) => makeQuestion(e));
    return questions;
  }

  /* FSRS 出题：到期队列（due<=now 且未被掌握/排除）优先，交错随机；不足再随机补新字 */
  function buildQuestionsFSRS(mode, pair, count, opts) {
    const pool = entryPool(mode, pair, opts);
    // char → 该字的全部读音条目（到期卡片按字命中，双读音字两个考点都可入批）
    const poolByChar = new Map();
    for (const e of pool) {
      if (!poolByChar.has(e.char)) poolByChar.set(e.char, []);
      poolByChar.get(e.char).push(e);
    }
    const countNum = isFinite(count) ? count : 20; // 无限模式按批 20 题
    const now = Date.now();

    // 到期复习队列（交错随机，保证相似字不扎堆）
    const dueEntries = Store.getDueKeys(now, 2000)
      .filter((d) => poolByChar.has(d.char))
      .flatMap((d) => poolByChar.get(d.char));

    const questions = [];
    const used = new Set(); // (char,reading) 复合键去重
    const pick = (e, fromFSRS) => {
      const key = e.char + "|" + e.reading;
      if (used.has(key)) return;
      used.add(key);
      questions.push(makeQuestion(Object.assign({}, e, { fromFSRS })));
    };
    for (const e of shuffle(dueEntries)) {
      if (questions.length >= countNum) break;
      pick(e, true);
    }
    // 不足：随机补充未到期/新字
    if (questions.length < countNum) {
      for (const e of shuffle(pool)) {
        if (questions.length >= countNum) break;
        pick(e, false);
      }
    }
    return questions;
  }

  /* ================= 拼音辅助：声调提取/标调/音对互换 ================= */
  const TONE_MAP = {
    "ā": 1, "á": 2, "ǎ": 3, "à": 4, "ē": 1, "é": 2, "ě": 3, "è": 4,
    "ī": 1, "í": 2, "ǐ": 3, "ì": 4, "ō": 1, "ó": 2, "ǒ": 3, "ò": 4,
    "ū": 1, "ú": 2, "ǔ": 3, "ù": 4, "ǖ": 1, "ǘ": 2, "ǚ": 3, "ǜ": 4,
  };
  const TONE_CHARS = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", ü: "ǖǘǚǜ" };

  function stripTone(py) {
    return String(py).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }
  function toneDigit(py) {
    for (const ch of py) if (TONE_MAP[ch] !== undefined) return TONE_MAP[ch];
    return null; // 无调号（轻声）
  }
  /* 把调号标到 body 的正确元音上（a > o/e > ui/iu 标后 > 其余） */
  function tonify(body, digit) {
    if (!digit) return body;
    let idx = -1;
    if (body.includes("a")) idx = body.indexOf("a");
    else if (body.includes("o")) idx = body.indexOf("o");
    else if (body.includes("e")) idx = body.indexOf("e");
    else if (body.includes("ui")) idx = body.indexOf("ui") + 1;
    else if (body.includes("iu")) idx = body.indexOf("iu") + 1;
    else {
      for (let i = 0; i < body.length; i++) {
        if ("iuü".includes(body[i])) { idx = i; break; }
      }
    }
    if (idx < 0) return body;
    const tones = TONE_CHARS[body[idx]];
    if (!tones) return body;
    return body.slice(0, idx) + tones[digit - 1] + body.slice(idx + 1);
  }
  /* 韵母互换：in<->ing、en<->eng（保留声调） */
  function swapVowel(py) {
    const digit = toneDigit(py);
    const nt = stripTone(py);
    let body = nt;
    if (nt.endsWith("ing")) body = nt.slice(0, -3) + "in";
    else if (nt.endsWith("in")) body = nt.slice(0, -2) + "ing";
    else if (nt.endsWith("eng")) body = nt.slice(0, -3) + "en";
    else if (nt.endsWith("en")) body = nt.slice(0, -2) + "eng";
    else return py;
    return tonify(body, digit);
  }
  /* 声母互换：l<->n（保留声调） */
  function swapInitial(py) {
    const digit = toneDigit(py);
    const nt = stripTone(py);
    let body = nt;
    if (nt[0] === "l") body = "n" + nt.slice(1);
    else if (nt[0] === "n") body = "l" + nt.slice(1);
    else return py;
    return tonify(body, digit);
  }
  /* 读音的音对标签（韵母优先） */
  function tagOf(py) {
    const nt = stripTone(py);
    if (nt.endsWith("in")) return "in";
    if (nt.endsWith("ing")) return "ing";
    if (nt.endsWith("en")) return "en";
    if (nt.endsWith("eng")) return "eng";
    if (nt[0] === "l") return "l";
    if (nt[0] === "n") return "n";
    return "";
  }
  /* 鼻音韵母组（in/ing 或 en/eng）；非鼻音韵母返回 null */
  function vowelGroup(py) {
    const nt = stripTone(py);
    if (nt.endsWith("in") || nt.endsWith("ing")) return "in/ing";
    if (nt.endsWith("en") || nt.endsWith("eng")) return "en/eng";
    return null;
  }

  /* 构造选项：
     双音对字（读音同时命中鼻音韵母组 + l/n 声母，如「凝」níng）→ 4 选项：
       正确 + 韵母混淆（nin）+ 声母混淆（ling）+ 双重混淆（lin）
     其余 → 2 选项（正确 + 条目预设错误音） */
  function buildOptions(entry) {
    const correct = entry.options.correct;
    const vowel = vowelGroup(correct.py);
    const body = stripTone(correct.py);
    const hasLNA = body[0] === "l" || body[0] === "n";
    if (vowel && hasLNA) {
      const v = swapVowel(correct.py);
      const s = swapInitial(correct.py);
      const vs = swapInitial(v);
      return shuffle([
        { py: correct.py, tag: tagOf(correct.py), isCorrect: true },
        { py: v, tag: tagOf(v), isCorrect: false },
        { py: s, tag: tagOf(s), isCorrect: false },
        { py: vs, tag: tagOf(vs), isCorrect: false },
      ]);
    }
    return shuffle([
      { ...correct, isCorrect: true },
      { ...entry.options.wrong, isCorrect: false },
    ]);
  }

  /* 构造一题 */
  function makeQuestion(entry) {
    // 随机选词（词语题）；极少数无词条时退化为单字题
    const words = entry.words || [];
    let word = null;
    if (words.length > 0) {
      word = words[Math.floor(Math.random() * words.length)];
    }

    // 选项：correct + wrong（双音对字为 4 选项），随机顺序
    const correct = entry.options.correct;
    const order = buildOptions(entry);

    const q = {
      char: entry.char,
      pair: entry.pairName,
      entry: entry,
      word: word,
      isWordQuestion: !!word,
      correct: correct,
      options: order,
      diffVowel: vowelGroup(correct.py) || entry.pairName, // 4 选项时按韵母维度高亮
      diffKey: diffKeyOf(entry.pairName, correct.tag), // 差异高亮
      fromFSRS: !!entry.fromFSRS, // 是否来自 FSRS 到期复习队列（统计/训练区分）
      rows: null, // 多行题时填充 [{char, pair, correct, options, diffKey}, ...]
    };

    // 词语题：把词中其他可考字也纳入考察（如「新娘」→ 新(xin/xing) + 娘(niang/liang)）
    // rows 按词中字的位置排列（保持用户阅读顺序）
    if (word && word.pinyin) {
      const pys = String(word.pinyin).trim().split(/\s+/);
      const chars = Array.from(word.word);
      if (chars.length === pys.length && chars.length > 1) {
        const rows = [];
        const seen = new Set();
        for (let i = 0; i < chars.length && rows.length < MAX_ROWS; i++) {
          const c = chars[i];
          if (seen.has(c)) continue; // 去重（如「仅仅」）
          if (c === q.char) {
            rows.push({ char: q.char, pair: q.pair, correct: q.correct, options: q.options, diffKey: q.diffKey, diffVowel: q.diffVowel });
            seen.add(c);
            continue;
          }
          const hit = (CHAR_LOOKUP[c] || []).find((h) => h.reading === pys[i]); // 按词内实际读音精确匹配
          if (!hit) continue;
          seen.add(c);
          const e = hit.entry;
          const cCorrect = e.options.correct;
          rows.push({
            char: c,
            pair: hit.pair,
            correct: cCorrect,
            options: buildOptions(e),
            diffVowel: vowelGroup(cCorrect.py) || hit.pair,
            diffKey: diffKeyOf(hit.pair, cCorrect.tag),
          });
        }
        if (rows.length > 1) q.rows = rows;
      }
    }
    return q;
  }

  /* 差异部分：in/ing → n/ng；en/eng → n/ng；l/n → l/n（首字母） */
  function diffKeyOf(pairName, tag) {
    if (pairName === "l/n") return tag; // 'l' 或 'n' 声母
    if (tag === "in" || tag === "en") return "n";
    if (tag === "ing" || tag === "eng") return "ng";
    return "";
  }

  /* 韵母/声母标签文本 */
  function tagLabel(pairName, tag) {
    if (pairName === "l/n") return tag === "l" ? "l 声母" : "n 声母";
    return tag + " 韵母";
  }

  /* 选项拼音渲染：差异部分加粗（in/ing: n/ng；l/n: 首字母） */
  function renderPy(py, pairName, diff) {
    let idx = -1;
    if (pairName === "l/n") {
      idx = py.search(/[lLnN]/);
    } else {
      const nt = py.toLowerCase();
      const i = nt.lastIndexOf(diff);
      if (i >= 0) idx = i;
    }
    if (idx < 0) return '<span class="py">' + escapeHtml(py) + "</span>";
    const head = escapeHtml(py.slice(0, idx));
    const d = escapeHtml(py.slice(idx, idx + diff.length));
    const tail = escapeHtml(py.slice(idx + diff.length));
    return (
      '<span class="py">' +
      head +
      '<span class="diff">' +
      d +
      "</span>" +
      tail +
      "</span>"
    );
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* 轮次状态机 */
  let round = null; // {mode, pair, questions, index, correctCount, wrongList, startTime, source, infinite, seenChars, opts}

  function startRound(mode, pair, count, opts) {
    opts = opts || {};
    // count 为 "infinite" / Infinity 时为无限模式：不设上限，题目耗尽自动补题
    const infinite = count === "infinite" || count === Infinity;
    const n = infinite ? Infinity : count;
    const questions = buildQuestions(mode, pair, n, opts);
    round = {
      mode,
      pair,
      questions,
      index: 0,
      maxIndex: 0, // 本轮已到达的最大题位（回溯后用于判断是否在最新位置）
      correctCount: 0,
      wrongList: [], // {char, word, correctPy, wrongPy, pair}
      startTime: Date.now(),
      source: opts.source ? opts.source : "normal",
      infinite,
      seenChars: [], // 本轮已出过的字（无限模式用于补题排重）
      opts,
    };
    return round;
  }

  /* 无限模式补题：题库耗尽时重新洗牌补一批，优先排除本轮已出过的考点（字+读音） */
  function refill() {
    if (!round) return;
    let fresh = buildQuestions(
      round.mode,
      round.pair,
      Infinity,
      Object.assign({}, round.opts, { excludeChars: round.seenChars })
    );
    if (!fresh.length) {
      // 题库已全部练过一遍 → 清空记录，重新开始
      round.seenChars = [];
      fresh = buildQuestions(round.mode, round.pair, Infinity, round.opts);
    }
    round.questions = round.questions.concat(fresh);
  }

  function getRound() {
    return round;
  }

  function currentQuestion() {
    if (!round || round.index >= round.questions.length) return null;
    return round.questions[round.index];
  }

  /* 作答：optionIsCorrect 为所选选项是否正确；返回 {correct, q, rec} */
  function answer(selectedOption) {
    const q = currentQuestion();
    if (!q) return null;
    const isCorrect = selectedOption.isCorrect;

    // 记录该题作答状态（供回溯时渲染"已答完"视图）
    q.answered = true;
    q.pick = selectedOption;

    // 完整记录本次作答（对错都记），供统计与 FSRS 记忆模型使用
    Store.recordAnswer({
      char: q.char,
      pair: q.pair,
      rating: isCorrect ? 3 : 1, // FSRS rating：1=again(错) 3=good(对)
      word: q.word ? q.word.word : null,
      correctPy: q.correct.py,
      wrongPy: isCorrect ? null : selectedOption.py,
      mode: round.mode,
      source: round.source,
      fromFSRS: !!q.fromFSRS,
    });

    if (isCorrect) {
      round.correctCount += 1;
      // 若该字在错题本中，记录一次答对（连续 2 次自动移出）
      if (Store.getWrongBook()[q.char]) {
        Store.markWrongCorrect(q.char);
      }
    } else {
      round.wrongList.push({
        char: q.char,
        word: q.word ? q.word.word : q.char,
        correctPy: q.correct.py,
        wrongPy: selectedOption.py,
        pair: q.pair,
      });
      // 自动记入错题本
      Store.addWrong({
        char: q.char,
        pair: q.pair,
        wrongPy: selectedOption.py,
        correctPy: q.correct.py,
        word: q.word ? q.word.word : q.char,
      });
    }
    return { correct: isCorrect, q, wrongList: round.wrongList };
  }

  /* 多行题：作答其中一行；整题完成前允许修改选择，
     作答流水统一在 commitQuestion 按最终选择记录（修改不重复计入统计） */
  function answerRow(rowIndex, selectedOption) {
    const q = currentQuestion();
    if (!q || !q.rows) return null;
    const row = q.rows[rowIndex];
    if (!row) return null;
    const isCorrect = selectedOption.isCorrect;
    q.rowResults = q.rowResults || [];
    q.rowResults[rowIndex] = isCorrect;
    q.rowPicks = q.rowPicks || [];
    q.rowPicks[rowIndex] = selectedOption;
    return { correct: isCorrect, row, q };
  }

  /* 多行题：全部行作答完毕后提交，更新轮次统计（整题全对才算答对） */
  function commitQuestion() {
    const q = currentQuestion();
    if (!q || !q.rows) return null;
    const results = q.rowResults || [];
    // 每个字按最终选择记录作答流水（整题完成前可修改，故延迟到提交时记录）
    q.rows.forEach((row, i) => {
      const pick = (q.rowPicks || [])[i];
      if (!pick) return;
      Store.recordAnswer({
        char: row.char,
        pair: row.pair,
        rating: results[i] ? 3 : 1, // FSRS rating：1=again(错) 3=good(对)
        word: q.word ? q.word.word : null,
        correctPy: row.correct.py,
        wrongPy: results[i] ? null : pick.py,
        mode: round.mode,
        source: round.source,
        fromFSRS: !!q.fromFSRS,
      });
    });
    const allCorrect = results.length === q.rows.length && results.every(Boolean);
    if (allCorrect) {
      round.correctCount += 1;
      q.rows.forEach((row) => {
        if (Store.getWrongBook()[row.char]) Store.markWrongCorrect(row.char);
      });
    } else {
      q.rows.forEach((row, i) => {
        if (results[i]) return;
        const pick = (q.rowPicks || [])[i];
        round.wrongList.push({
          char: row.char,
          word: q.word ? q.word.word : row.char,
          correctPy: row.correct.py,
          wrongPy: pick ? pick.py : "",
          pair: row.pair,
        });
        Store.addWrong({
          char: row.char,
          pair: row.pair,
          wrongPy: pick ? pick.py : "",
          correctPy: row.correct.py,
          word: q.word ? q.word.word : row.char,
        });
      });
    }
    return { correct: allCorrect, q, wrongList: round.wrongList };
  }

  function next() {
    const q = round.questions[round.index];
    if (q) round.seenChars.push(q.char + "|" + (q.entry ? q.entry.reading : "")); // 复合键，补题按考点排重
    round.index += 1;
    round.maxIndex = Math.max(round.maxIndex, round.index);
    // 无限模式：题目耗尽时自动补一批
    if (round.infinite && round.index >= round.questions.length) {
      refill();
    }
  }

  /* 回溯：回到上一题（只读查看，不改统计） */
  function prev() {
    if (!round) return;
    round.index = Math.max(0, round.index - 1);
  }

  /* 跳到指定题位（用于"继续作答"回到最新位置），clamp 到有效范围 */
  function jumpTo(idx) {
    if (!round) return;
    const max = Math.min(round.maxIndex, Math.max(0, round.questions.length - 1));
    round.index = Math.max(0, Math.min(idx, max));
  }

  /* 是否处于最新位置（false = 正在回溯查看历史） */
  function isAtLatest() {
    return !round || round.index >= round.maxIndex;
  }

  function isFinished() {
    // 无限模式永不自然结束，由用户主动结束
    if (round && round.infinite) return false;
    return round && round.index >= round.questions.length;
  }

  function finishRound() {
    if (!round) return null;
    const durationSec = Math.round((Date.now() - round.startTime) / 1000);
    // 无限模式统计实际答题数（而非动态增长的题目数组长度）
    const total = round.infinite ? round.correctCount + round.wrongList.length : round.questions.length;
    const record = {
      mode: round.mode,
      pair: round.pair,
      total,
      correct: round.correctCount,
      durationSec,
    };
    Store.addHistory(record);
    const summary = {
      round,
      total,
      correct: round.correctCount,
      rate: total ? Math.round((round.correctCount / total) * 100) : 0,
      wrongList: round.wrongList,
      durationSec,
      record,
    };
    return summary;
  }

  /* 辅助：音对元信息 */
  function pairMeta(pairName) {
    const p = DATA.pairs[pairName];
    return {
      name: pairName,
      label: p ? p.label : "综合随机",
      desc: p ? p.desc : "混合所有音对",
      color: p ? p.color : "#1677FF",
      totalEntries: p ? p.entries.length : 0,
    };
  }

  window.Quiz = {
    DATA,
    PAIR_ORDER,
    CHAR_LOOKUP,
    allEntries,
    entryPool,
    buildQuestions,
    startRound,
    getRound,
    currentQuestion,
    answer,
    answerRow,
    commitQuestion,
    next,
    prev,
    jumpTo,
    isAtLatest,
    isFinished,
    finishRound,
    makeQuestion,
    buildOptions,
    swapVowel,
    swapInitial,
    tagOf,
    vowelGroup,
    stripTone,
    tagLabel,
    renderPy,
    escapeHtml,
    diffKeyOf,
    pairMeta,
    shuffle,
  };
})();
