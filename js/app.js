/* ============================================================
   模糊音克星 · 应用控制器（视图切换 + 渲染 + 交互）
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* HTML 转义唯一实现（quiz.js 导出，app.js 复用） */
  const escapeHtml = (s) => Quiz.escapeHtml(s);

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  /* ---------------- Popconfirm ---------------- */
  function popconfirm(title, text, onOk) {
    const mask = document.createElement("div");
    mask.className = "popover-mask";
    mask.innerHTML =
      '<div class="popover-box">' +
      '<div class="pop-title">' + escapeHtml(title) + "</div>" +
      '<div class="pop-text">' + escapeHtml(text) + "</div>" +
      '<div class="pop-actions">' +
      '<button class="ant-btn" data-act="cancel">取消</button>' +
      '<button class="ant-btn primary" data-act="ok">确认</button>' +
      "</div></div>";
    mask.addEventListener("click", (ev) => {
      const act = ev.target.getAttribute && ev.target.getAttribute("data-act");
      if (act === "ok") {
        onOk();
        mask.remove();
      } else if (act === "cancel" || ev.target === mask) {
        mask.remove();
      }
    });
    document.body.appendChild(mask);
  }

  /* ---------------- 时间格式化 ---------------- */
  function fmtTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function fmtClock(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, "0");
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const hm = pad(d.getHours()) + ":" + pad(d.getMinutes());
    if (sameDay) return "今天 " + hm;
    const yesterday = new Date(today.getTime() - 86400000);
    if (d.toDateString() === yesterday.toDateString()) return "昨天 " + hm;
    return pad(d.getMonth() + 1) + "月" + pad(d.getDate()) + "日 " + hm;
  }

  /* ---------------- 统计计算 ---------------- */
  function statsOf(rangeDays) {
    const history = Store.getHistory();
    const mastered = Store.getMastered();
    const wrongBook = Store.getWrongBook();
    const all = history;
    const total = all.reduce((s, r) => s + r.total, 0);
    const correct = all.reduce((s, r) => s + r.correct, 0);
    const totalRate = total ? Math.round((correct / total) * 100) : null;

    // 每日聚合
    const dayMap = {};
    all.forEach((r) => {
      const key = new Date(r.date).toDateString();
      if (!dayMap[key]) dayMap[key] = { total: 0, correct: 0 };
      dayMap[key].total += r.total;
      dayMap[key].correct += r.correct;
    });
    const dayKeys = Object.keys(dayMap).sort((a, b) => new Date(a) - new Date(b));

    // 连续打卡
    let streak = 0;
    const d = new Date();
    if (dayMap[d.toDateString()]) {
      streak = 1;
      while (true) {
        d.setDate(d.getDate() - 1);
        if (dayMap[d.toDateString()]) streak += 1;
        else break;
      }
    }

    // 各音对
    const pairStats = {};
    Quiz.PAIR_ORDER.forEach((p) => {
      const meta = Quiz.pairMeta(p);
      const recs = all.filter((r) => r.pair === p);
      const t = recs.reduce((s, r) => s + r.total, 0);
      const c = recs.reduce((s, r) => s + r.correct, 0);
      const masteredCount = Object.values(mastered).filter((m) => m.pair === p).length;
      pairStats[p] = {
        meta,
        total: t,
        correct: c,
        rate: t ? Math.round((c / t) * 100) : null,
        masteredCount,
      };
    });

    return { history, total, correct, totalRate, dayMap, dayKeys, streak, pairStats, mastered, wrongBook };
  }

  /* 趋势序列（最近 N 天，含今天，无数据显示 null） */
  function trendSeries(stats, days) {
    const out = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toDateString();
      const rec = stats.dayMap[key];
      out.push({
        label: fmtDayLabel(d),
        rate: rec ? Math.round((rec.correct / rec.total) * 100) : null,
        total: rec ? rec.total : 0,
      });
    }
    return out;
  }
  function fmtDayLabel(d) {
    const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return week[d.getDay()];
  }

  /* ---------------- 视图切换 ---------------- */
  function show(view) {
    $$(".view").forEach((v) => v.classList.remove("active"));
    $("#view-" + view).classList.add("active");
    // 导航高亮
    $$("#topNav a, #sider .menu-item").forEach((a) => {
      a.classList.toggle("active", a.getAttribute("data-view") === view);
    });
    // 答题中离开则停止残留朗读与待切题计时
    // （keydown 监听常驻不移除：handler 内部自守卫视图激活；移除会导致离开答题页后快捷键永久失效）
    if (view !== "quiz") {
      clearTimeout(autoNextTimer);
      if (window.TTS) TTS.stop();
    }
    window.scrollTo(0, 0);
    if (view === "home") renderHome();
    else if (view === "stats") renderStats();
    else if (view === "mastered") renderMastered();
    else if (view === "wrongbook") renderWrongbook();
    else if (view === "settings") renderSettings();
    else if (view === "quiz") renderQuiz();
    else if (view === "result" && window._lastSummary) renderResult(window._lastSummary);
    labelTables();
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    const stats = statsOf(7);
    const settings = Store.getSettings();
    // 待重练错题数：排除已掌握而隐藏的记录
    const wrongCount = Object.values(stats.wrongBook).filter((it) => !it.hidden).length;

    // 音对卡
    let cards = Quiz.PAIR_ORDER.map((p) => {
      const ps = stats.pairStats[p];
      const rate = ps.rate == null ? 0 : ps.rate;
      const color = ps.meta.color;
      return (
        '<div class="ant-card hoverable" onclick="App.startPair(\'' + p + '\')">' +
        '<div class="card-body pair-card">' +
        '<div class="pair-name" style="color:' + color + '">' + escapeHtml(ps.meta.label) + "</div>" +
        '<div class="pair-desc">' + escapeHtml(ps.meta.desc) + ' · <span class="nowrap">' + ps.meta.totalEntries + " 字</span></div>" +
        '<div class="pair-bar"><i style="width:' + rate + "%;background:" + color + '"></i></div>' +
        '<div class="pair-meta">正确率 ' + (ps.rate == null ? "--" : ps.rate + "%") + "</div>" +
        "</div></div>"
      );
    }).join("");
    const mixMeta = Quiz.pairMeta(null);
    cards +=
      '<div class="ant-card hoverable big" onclick="App.startMix()">' +
      '<div class="card-body pair-card">' +
      '<div class="pair-name" style="color:var(--primary)">综合随机</div>' +
      '<div class="pair-desc">混合所有音对 · <span class="nowrap">' + totalEntries() + " 字</span></div>" +
      '<div class="pair-bar"><i style="width:' + overallRateOf(stats) + '%;background:var(--primary)"></i></div>' +
      '<div class="pair-meta" style="color:var(--primary)">推荐 · 每日一练</div>' +
      "</div></div>";
    $("#homePairCards").innerHTML = cards;

    // 统计卡
    const delta = trendDelta(stats, 7);
    $("#homeStats").innerHTML =
      statCard("总正确率", stats.totalRate == null ? "--" : stats.totalRate + "%") +
      statCard("7 天趋势", delta == null ? "--" : (delta >= 0 ? "+" : "") + delta + "%", delta) +
      statCard("音对分布", Quiz.PAIR_ORDER.length + " 组") +
      statCard("待重练错题", wrongCount + " 条");

    // 操作行
    $("#homeActions").innerHTML =
      '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
      '<button class="ant-btn primary lg" onclick="App.startMix()">开始综合练习</button>' +
      '<button class="ant-btn lg" onclick="App.startWrongbook()" ' + (wrongCount ? "" : "disabled") + ">错题重练</button>" +
      "</div>" +
      '<div class="segmented" id="countSeg">' +
      countSegItems(settings) +
      "</div>";
    $$("#countSeg span").forEach((s) =>
      s.addEventListener("click", () => {
        const k = s.getAttribute("data-count");
        if (k === "custom") {
          openCustomCountDialog();
          return;
        }
        const val = k === "infinite" ? "infinite" : +k;
        Store.setSettings({ defaultCount: val });
        renderHome();
        toast(val === "infinite" ? "已设为无限模式" : "题量已设为 " + val + " 题");
      })
    );

    // 最近练习表
    const recent = stats.history.slice(-4).reverse();
    $("#homeRecent").innerHTML =
      '<div class="card-body">' +
      '<div class="row-between" style="margin-bottom:12px">' +
      '<span style="font-size:15px;font-weight:500">最近练习</span>' +
      '<span class="ant-tag blue">本地记录</span>' +
      "</div>" +
      (recent.length
        ? '<div class="table-wrap"><table class="ant-table"><thead><tr>' +
          "<th>时间</th><th>模式</th><th>题数</th><th>正确率</th><th>结果</th>" +
          "</tr></thead><tbody>" +
          recent.map(historyRow).join("") +
          "</tbody></table></div>"
        : emptyHint("还没有练习记录，点击上方「开始综合练习」开始吧"))
      "</div>";
    labelTables();
  }

  /* 题量选项：5 / 10 / 20 / 自定义 / 无限 */
  function countSegItems(settings) {
    const dc = settings.defaultCount;
    const presets = [5, 10, 20];
    const isCustom = typeof dc === "number" && presets.indexOf(dc) < 0;
    const items = [
      ...presets.map((n) => ({ key: String(n), label: n + " 题", active: dc === n })),
      { key: "custom", label: isCustom ? "自定义 · " + dc + " 题" : "自定义", active: isCustom },
      { key: "infinite", label: "无限", active: dc === "infinite" },
    ];
    return items
      .map(
        (it) =>
          '<span data-count="' + it.key + '" class="' + (it.active ? "active" : "") + '">' +
          it.label + "</span>"
      )
      .join("");
  }

  /* 自定义题量输入弹窗（1 - 1000） */
  function openCustomCountDialog() {
    const mask = document.createElement("div");
    mask.className = "popover-mask";
    mask.innerHTML =
      '<div class="popover-box">' +
      '<div class="pop-title">自定义题量</div>' +
      '<div class="pop-text">输入每轮答题数量（1 - 1000 题）</div>' +
      '<input class="ant-input" id="customCountInput" type="number" min="1" max="1000" placeholder="例如 30">' +
      '<div class="pop-actions">' +
      '<button class="ant-btn" data-act="cancel">取消</button>' +
      '<button class="ant-btn primary" data-act="ok">确定</button>' +
      "</div></div>";
    const input = mask.querySelector("#customCountInput");
    const close = () => mask.remove();
    const apply = () => {
      const v = Math.round(Number(input.value));
      if (!isFinite(v) || v < 1 || v > 1000) {
        toast("请输入 1 - 1000 之间的整数");
        input.focus();
        return;
      }
      Store.setSettings({ defaultCount: v });
      renderHome();
      toast("题量已设为 " + v + " 题");
      close();
    };
    mask.addEventListener("click", (ev) => {
      const act = ev.target.getAttribute && ev.target.getAttribute("data-act");
      if (act === "ok") apply();
      else if (act === "cancel" || ev.target === mask) close();
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") apply();
      else if (ev.key === "Escape") close();
    });
    document.body.appendChild(mask);
    setTimeout(() => input.focus(), 0);
  }

  function totalEntries() {
    return Quiz.PAIR_ORDER.reduce((s, p) => s + Quiz.allEntries(p).length, 0);
  }
  function overallRateOf(stats) {
    const recs = stats.history.filter((r) => r.mode === "mix");
    const t = recs.reduce((s, r) => s + r.total, 0);
    const c = recs.reduce((s, r) => s + r.correct, 0);
    return t ? Math.round((c / t) * 100) : 0;
  }
  function statCard(label, value, delta) {
    return (
      '<div class="ant-card"><div class="card-body stat-card">' +
      '<div class="stat-label">' + label + "</div>" +
      '<div class="stat-value">' + value +
      (delta != null ? '<div class="stat-delta ' + (delta >= 0 ? "up" : "down") + '">' + (delta >= 0 ? "▲ " : "▼ ") + Math.abs(delta) + "%</div>" : "") +
      "</div></div></div>"
    );
  }
  function trendDelta(stats, days) {
    const series = trendSeries(stats, days);
    const half = Math.floor(days / 2);
    const cur = series.slice(half).filter((s) => s.rate != null);
    const prev = series.slice(0, half).filter((s) => s.rate != null);
    if (!cur.length || !prev.length) return null;
    const avg = (arr) => arr.reduce((s, x) => s + x.rate, 0) / arr.length;
    return Math.round(avg(cur) - avg(prev));
  }
  function historyRow(r) {
    const rate = r.total ? Math.round((r.correct / r.total) * 100) : 0;
    const pairTag =
      r.mode === "pair"
        ? '<span class="ant-tag ' + pairTagClass(r.pair) + '">' + escapeHtml(Quiz.pairMeta(r.pair).label) + "</span> 专项"
        : "综合随机";
    let resultTag;
    if (rate >= 80) resultTag = '<span class="ant-tag green">不错</span>';
    else if (rate >= 60) resultTag = '<span class="ant-tag green">继续加油</span>';
    else resultTag = '<span class="ant-tag">需要巩固</span>';
    return (
      '<tr><td data-label="时间">' + fmtClock(r.date) + '</td><td data-label="模式">' + pairTag + '</td><td data-label="题数">' +
      r.total + '</td><td data-label="正确率">' + rate + '%</td><td data-label="结果">' + resultTag + "</td></tr>"
    );
  }
  function pairTagClass(pair) {
    return { "in/ing": "pair-in", "en/eng": "pair-en", "l/n": "pair-ln" }[pair] || "";
  }
  function emptyHint(text) {
    return '<div class="empty-hint">' + escapeHtml(text) + "</div>";
  }

  /* 窄屏表格卡片化兜底：把 thead 列名写入各 td 的 data-label，供 CSS 用 attr() 渲染标签；
     渲染时已手写 data-label 的单元格不覆盖 */
  function labelTables() {
    $$(".ant-table").forEach((table) => {
      const ths = Array.prototype.map.call(
        table.querySelectorAll("thead th"),
        (th) => th.textContent.trim()
      );
      table.querySelectorAll("tbody tr").forEach((tr) => {
        const tds = tr.querySelectorAll("td");
        for (let i = 0; i < tds.length; i++) {
          if (!tds[i].hasAttribute("data-label") && ths[i]) tds[i].setAttribute("data-label", ths[i]);
        }
      });
    });
  }

  /* ---------------- 答题页 ---------------- */
  let autoNextTimer = null;
  let quizSeq = 0; // F6：答题页序号，切题时自增，使未完成的朗读回调失效

  /* ---- TTS 接入（docs/tts-prd.md F2/F5/F6） ---- */
  function ttsTextOf(q) {
    return q.word ? q.word.word : q.char;
  }
  /* F6：作答后自动朗读 1 遍；scheduleNext 时等播完再启动 1 秒切题倒计时。
     TTS 关闭/不支持时行为与旧逻辑完全一致（立即计时/不计时） */
  function speakThen(q, scheduleNext) {
    const seq = quizSeq;
    if (scheduleNext) clearTimeout(autoNextTimer);
    if (!window.TTS || !TTS.enabled()) {
      if (scheduleNext) autoNextTimer = setTimeout(nextQuestion, 1000);
      return;
    }
    TTS.speak(ttsTextOf(q)).then(() => {
      // 期间已切题/离开答题页则放弃调度，避免意外跳题
      if (seq !== quizSeq || !$("#view-quiz").classList.contains("active")) return;
      if (scheduleNext) autoNextTimer = setTimeout(nextQuestion, 1000);
    });
  }
  /* F5：作答后在词语旁追加手动朗读图标（可反复点击，不受开关约束） */
  function showReplayIcon(q) {
    const wordEl = $("#quizCard .quiz-word");
    if (!wordEl || wordEl.querySelector(".quiz-replay")) return;
    if (!window.TTS || !TTS.supported()) return;
    const btn = document.createElement("button");
    btn.className = "quiz-replay";
    btn.title = "重听朗读";
    btn.textContent = "🔉";
    const text = ttsTextOf(q);
    btn.addEventListener("click", () => TTS.speak(text, { ignoreSwitch: true }));
    wordEl.appendChild(btn);
  }
  /* F2：答题页右上角朗读开关两态 */
  function updateTtsToggle() {
    const btn = $("#btnTtsToggle");
    if (!btn) return;
    const usable = window.TTS && TTS.supported();
    btn.style.display = usable ? "" : "none";
    if (!usable) return;
    const on = TTS.enabled();
    btn.textContent = on ? "🔊" : "🔇";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("tts-off", !on);
  }
  function toggleTts() {
    if (!window.TTS || !TTS.supported()) return;
    const on = !TTS.enabled();
    TTS.setEnabled(on);
    updateTtsToggle();
    toast(on ? "朗读已开启" : "朗读已关闭");
  }

  function startQuiz(mode, pair, opts) {
    clearTimeout(autoNextTimer);
    const settings = Store.getSettings();
    const count = opts && opts.count ? opts.count : settings.defaultCount;
    // 无限模式来源标记（写入每次作答流水，便于统计区分）
    const finalOpts = Object.assign({}, opts, {
      source: (opts && opts.source) || (count === "infinite" ? "infinite" : "normal"),
    });
    const round = Quiz.startRound(mode, pair, count, finalOpts);

    // 空池提示
    if (!round.questions.length) {
      const msg =
        (opts && opts.onlyChars ? "该字已掌握或不存在于词库" : "题库已清空（可能都已掌握）") +
        "，可去「已掌握」撤回后重试";
      popconfirm("没有可用题目", msg, () => show("home"));
      return;
    }
    show("quiz");
    renderQuiz();
  }

  function renderQuiz() {
    quizSeq++; // F6：切题序号自增，使上一题未完成的朗读回调失效
    updateTtsToggle();
    const q = Quiz.currentQuestion();
    const round = Quiz.getRound();
    if (!q) {
      finishQuiz();
      return;
    }
    // 工具条
    const meta = q.pair === "mix" ? null : Quiz.pairMeta(q.pair);
    $("#quizModeLabel").textContent =
      round.mode === "pair" ? meta.label + " 专项" : "综合随机";
    const infinite = !!round.infinite;
    const prog = $("#quizProgress");
    if (infinite) {
      // 无限模式：显示已答题数，进度条为流动动画
      $("#quizProgressText").textContent = "无限模式 · 已答 " + (round.index + 1) + " 题";
      $("#quizProgressBar").className = "bar infinite";
      $("#quizProgressBar").style.width = "100%";
      if (prog) {
        prog.setAttribute("aria-valuetext", "已答 " + (round.index + 1) + " 题");
        prog.removeAttribute("aria-valuenow");
      }
      const quitBtn = $("#btnQuitQuiz");
      if (quitBtn) quitBtn.textContent = "结束本轮";
    } else {
      $("#quizProgressText").textContent = round.index + 1 + " / " + round.questions.length;
      $("#quizProgressBar").className = "bar";
      $("#quizProgressBar").style.width =
        Math.round((round.index / round.questions.length) * 100) + "%";
      if (prog) {
        prog.setAttribute("aria-valuenow", String(Math.round((round.index / round.questions.length) * 100)));
        prog.removeAttribute("aria-valuetext");
      }
      const quitBtn = $("#btnQuitQuiz");
      if (quitBtn) quitBtn.textContent = "‹ 返回";
    }
    $("#quizPairTag").className =
      "ant-tag " + (round.mode === "pair" ? pairTagClass(q.pair) : "blue");
    $("#quizPairTag").textContent = round.mode === "pair" ? Quiz.pairMeta(q.pair).label : "综合";

    // 答题卡
    const rows = q.rows;
    const wordHtml = q.isWordQuestion ? renderWord(q) : '<div class="quiz-word"><span class="target">' + escapeHtml(q.char) + "</span></div>";
    const optionsHtml = rows
      ? '<div class="quiz-rows">' +
        rows
          .map(
            (row, ri) =>
              '<div class="quiz-row" data-r="' + ri + '">' +
              '<span class="quiz-row-char">' + escapeHtml(row.char) + "</span>" +
              '<div class="quiz-row-opts' + (row.options.length === 4 ? " opts-4" : "") + '">' +
              row.options
                .map(
                  (o, i) =>
                    '<button class="quiz-option" data-r="' + ri + '" data-i="' + i + '">' +
                    Quiz.renderPy(o.py, row.diffVowel || row.pair, Quiz.diffKeyOf(row.diffVowel || row.pair, o.tag)) +
                    '<span class="rhyme">' + escapeHtml(Quiz.tagLabel(row.diffVowel || row.pair, o.tag)) + "</span>" +
                    "</button>"
                )
                .join("") +
              "</div></div>"
          )
          .join("") +
        "</div>"
      : '<div class="quiz-options' + (q.options.length === 4 ? " opts-4" : "") + '">' +
        q.options
          .map(
            (o, i) =>
              '<button class="quiz-option" data-i="' + i + '">' +
              Quiz.renderPy(o.py, q.diffVowel || q.pair, Quiz.diffKeyOf(q.diffVowel || q.pair, o.tag)) +
              '<span class="rhyme">' + escapeHtml(Quiz.tagLabel(q.diffVowel || q.pair, o.tag)) + "</span>" +
              "</button>"
          )
          .join("") +
        "</div>";
    $("#quizCard").innerHTML =
      '<div class="quiz-hint">' +
      (q.isWordQuestion
        ? rows
          ? "词语题 · 本词含 " + rows.length + " 个考察字"
          : "词语题 · 目标字「" + escapeHtml(q.char) + "」"
        : "单字题 · 「" + escapeHtml(q.char) + "」") +
      "</div>" +
      wordHtml +
      '<div class="quiz-ask">' + (rows ? "请为每个字选择正确读音" : "请选择「" + escapeHtml(q.char) + "」的正确读音") + "</div>" +
      optionsHtml +
      '<div class="quiz-feedback"></div>' +
      '<div class="quiz-actions" style="display:none"></div>' +
      '<div class="quiz-mastered-tip" style="display:none"></div>';
    $$("#quizCard .quiz-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ri = rows ? +btn.getAttribute("data-r") : 0;
        const oi = +btn.getAttribute("data-i");
        submitAnswer(ri, oi);
      });
    });
    // 已答状态（回溯查看历史时）渲染为锁定 + 对错标色
    if (isQuestionAnswered(q)) {
      renderAnsweredState(q);
    }
    updateToolbarState(q);
    // 触屏设备（手机/平板）无实体键盘：提示改为点击操作
    const isTouch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    $("#quizKeyHint").textContent = rows
      ? (isTouch ? "多字题：请逐行点击选项作答" : "多字题：请逐行选择，按数字键作答当前行")
      : infinite
        ? "无限模式：答对自动下一题，随时点「结束本轮」查看复盘"
        : (isTouch ? "点击选项作答" : "键盘：按数字键作答") +
          (Quiz.getRound().index > 0 ? (isTouch ? "，点左下角回看上一题" : "，← 回看上一题") : "");
  }

  /* ================= 已掌握常驻按钮 & 回溯 ================= */

  /* 当前题的所有考察字（多字题=全部行字，单行=目标字） */
  function masteredCharsOf(q) {
    return q.rows ? q.rows.map((r) => r.char) : [q.char];
  }

  /* 该题是否已作答完毕（回溯时据此渲染已答状态） */
  function isQuestionAnswered(q) {
    if (!q) return false;
    if (q.rows) {
      const results = q.rowResults || [];
      return results.length >= q.rows.length && results.every((v) => v !== undefined);
    }
    return !!q.answered;
  }

  /* 工具栏状态：上一题可用性 / 继续作答按钮 / 右上角已掌握按钮 */
  function updateToolbarState(q) {
    const round = Quiz.getRound();
    const prevBtn = $("#btnPrev");
    if (prevBtn) prevBtn.disabled = !round || round.index <= 0;
    const resumeBtn = $("#btnResume");
    if (resumeBtn) resumeBtn.style.display = Quiz.isAtLatest() ? "none" : "";
    updateMasteredBtn(q);
  }

  /* 右上角「已掌握」按钮状态 */
  function updateMasteredBtn(q) {
    const btn = $("#btnMasteredTop");
    if (!btn) return;
    const chars = masteredCharsOf(q);
    const marked = chars.filter((c) => Store.isMastered(c));
    if (marked.length) {
      btn.classList.add("mastered");
      btn.textContent =
        chars.length > 1 && marked.length < chars.length
          ? "已掌握 ✓ " + marked.length + "/" + chars.length
          : "已掌握 ✓";
    } else {
      btn.classList.remove("mastered");
      btn.textContent = "已掌握";
    }
  }

  /* 揭示正确选项（未作答时点已掌握 = 跳过本题：标出正确项并锁定） */
  function revealCorrectOptions(q, chars) {
    const set = new Set(chars);
    $$("#quizCard .quiz-option").forEach((b) => {
      if (q.rows) {
        const ri = +b.getAttribute("data-r");
        const row = q.rows[ri];
        if (!row || !set.has(row.char)) return;
        const i = +b.getAttribute("data-i");
        b.disabled = true;
        if (row.options[i].isCorrect) b.classList.add("ok");
      } else {
        if (!set.has(q.char)) return;
        const i = +b.getAttribute("data-i");
        b.disabled = true;
        if (q.options[i].isCorrect) b.classList.add("ok");
      }
    });
    q.masteredRevealed = true;
  }

  /* 未作答时撤回已掌握 → 选项复原（去掉揭示效果） */
  function revertReveal(q) {
    if (!q.masteredRevealed || isQuestionAnswered(q)) return;
    $$("#quizCard .quiz-option").forEach((b) => {
      b.classList.remove("ok");
      b.disabled = false;
    });
    q.masteredRevealed = false;
  }

  /* 已掌握入口：单字题直接切换；多字题弹出多选 */
  function toggleMastered() {
    const q = Quiz.currentQuestion();
    if (!q) return;
    const chars = masteredCharsOf(q);
    if (chars.length > 1) {
      openMasteredPicker(q);
      return;
    }
    const char = chars[0];
    const pair = q.rows ? q.rows[0].pair : q.pair;
    if (Store.isMastered(char)) {
      Store.removeMastered(char);
      revertReveal(q);
      clearTimeout(autoNextTimer);
      updateMasteredBtn(q);
      toast("已撤回「" + char + "」的已掌握");
    } else {
      Store.addMastered(char, pair);
      revealCorrectOptions(q, [char]);
      updateMasteredBtn(q);
      toast("已标记「" + char + "」为已掌握");
      // 仅在最新题位自动前进；回溯查看历史时留在原地（不跳到下一道历史题）
      if (Quiz.isAtLatest()) scheduleNext(1000);
    }
  }

  /* 多字题：多选要标记/撤回的字 */
  function openMasteredPicker(q) {
    const mask = document.createElement("div");
    mask.className = "popover-mask";
    const rows = q.rows;
    const checks = rows
      .map(
        (row) =>
          '<label class="mastered-pick-item">' +
          '<input type="checkbox" data-i="' + rows.indexOf(row) + '"' + (Store.isMastered(row.char) ? " checked" : "") + ">" +
          '<span class="mp-char">' + escapeHtml(row.char) + "</span>" +
          '<span class="mp-py">' + escapeHtml(row.correct.py) + "</span>" +
          "</label>"
      )
      .join("");
    mask.innerHTML =
      '<div class="popover-box">' +
      '<div class="pop-title">标记已掌握</div>' +
      '<div class="pop-text">勾选已认识的字（不影响对错判定，仅决定后续是否继续出题）</div>' +
      '<div class="mastered-pick-list">' + checks + "</div>" +
      '<div class="pop-actions">' +
      '<button class="ant-btn" data-act="cancel">取消</button>' +
      '<button class="ant-btn primary" data-act="ok">确定</button>' +
      "</div></div>";
    const close = () => mask.remove();
    mask.addEventListener("click", (ev) => {
      const act = ev.target.getAttribute && ev.target.getAttribute("data-act");
      if (act === "ok") {
        const picked = Array.from(mask.querySelectorAll('input[type="checkbox"]'))
          .filter((cb) => cb.checked)
          .map((cb) => rows[+cb.getAttribute("data-i")]);
        const pickedChars = new Set(picked.map((r) => r.char));
        rows.forEach((row) => {
          if (pickedChars.has(row.char) && !Store.isMastered(row.char)) {
            Store.addMastered(row.char, row.pair);
          } else if (!pickedChars.has(row.char) && Store.isMastered(row.char)) {
            Store.removeMastered(row.char);
          }
        });
        revealCorrectOptions(q, [...pickedChars]);
        updateMasteredBtn(q);
        if (pickedChars.size) {
          toast("已标记 " + pickedChars.size + " 个字为已掌握");
          // 仅在最新题位自动前进；回溯查看历史时留在原地
          if (Quiz.isAtLatest()) scheduleNext(1000);
        } else {
          clearTimeout(autoNextTimer);
          toast("已撤回全部已掌握标记");
        }
        close();
      } else if (act === "cancel" || ev.target === mask) {
        close();
      }
    });
    document.body.appendChild(mask);
  }

  /* 统一自动下一题调度 */
  function scheduleNext(delay) {
    clearTimeout(autoNextTimer);
    autoNextTimer = setTimeout(nextQuestion, delay);
  }

  /* 回溯：回到上一题（取消自动下一题计时，只读查看） */
  function prevQuestion() {
    const round = Quiz.getRound();
    if (!round || round.index <= 0) return;
    clearTimeout(autoNextTimer);
    Quiz.prev();
    renderQuiz();
  }

  /* 回溯后回到最新位置继续作答 */
  function resumeLatest() {
    const round = Quiz.getRound();
    if (!round || Quiz.isAtLatest()) return;
    Quiz.jumpTo(round.maxIndex);
    renderQuiz();
  }

  function renderWord(q) {
    const w = q.word.word;
    const chars = Array.from(w);
    // 目标字 + 词中其他可考字全部高亮
    const targetSet = q.rows ? new Set(q.rows.map((r) => r.char)) : new Set([q.char]);
    const html = chars
      .map((c) => (targetSet.has(c) ? '<span class="target">' + escapeHtml(c) + "</span>" : escapeHtml(c)))
      .join("");
    return '<div class="quiz-word">' + html + "</div>";
  }

  /* 已答状态渲染（回溯查看历史时）：锁定选项 + 对错标色 + 整题反馈 */
  function renderAnsweredState(q) {
    const feedback = $("#quizCard .quiz-feedback");
    const actions = $("#quizCard .quiz-actions");
    const btns = $$("#quizCard .quiz-option");
    if (q.rows) {
      const results = q.rowResults || [];
      const picks = q.rowPicks || [];
      // 每行锁定 + 标色
      btns.forEach((b) => {
        const ri = +b.getAttribute("data-r");
        const row = q.rows[ri];
        if (!row) return;
        b.disabled = true;
        const i = +b.getAttribute("data-i");
        if (row.options[i].isCorrect) b.classList.add("ok");
        else if (picks[ri] && picks[ri] === row.options[i]) b.classList.add("bad");
      });
      const wrongRows = q.rows.filter((_, i) => !results[i]);
      feedback.innerHTML = wrongRows.length === 0
        ? '<div class="ant-alert success"><span>✔</span><span><b>回答正确！</b>全部 ' + q.rows.length + " 个字读音都对了。</span></div>"
        : '<div class="ant-alert error"><span>✘</span><span><b>有 ' + wrongRows.length +
          " 个字答错</b>，正确读音已标出。</span></div>";
    } else {
      btns.forEach((b, i) => {
        b.disabled = true;
        const opt = q.options[i];
        if (opt.isCorrect) b.classList.add("ok");
        else if (q.pick && q.pick === opt) b.classList.add("bad");
      });
      const corr = q.correct;
      const ok = q.pick && q.pick.isCorrect;
      feedback.innerHTML = ok
        ? '<div class="ant-alert success"><span>✔</span><span><b>回答正确！</b>' +
          explainCorrect(q.pair, corr.tag) + "</span></div>"
        : '<div class="ant-alert error"><span>✘</span><span><b>回答错误</b>，正确读音为 <b>' +
          escapeHtml(corr.py) + "</b>（" + escapeHtml(Quiz.tagLabel(q.pair, corr.tag)) + "）。</span></div>";
    }
    showReplayIcon(q); // F5：回溯查看已答题也可手动重听
    actions.style.display = "none";
  }

  function submitAnswer(rowIndex, optIndex) {
    const q = Quiz.currentQuestion();
    if (!q) return;
    const rows = q.rows;
    const btns = $$("#quizCard .quiz-option");
    let btn;
    if (rows) {
      btn = btns.find(
        (b) => b.getAttribute("data-r") === String(rowIndex) && b.getAttribute("data-i") === String(optIndex)
      );
    } else {
      btn = btns[optIndex];
    }
    if (!btn || btn.disabled) return;
    const feedback = $("#quizCard .quiz-feedback");
    const actions = $("#quizCard .quiz-actions");

    if (rows) {
      // ---- 多行题：逐行作答，整题完成前允许修改已答行 ----
      const selected = rows[rowIndex].options[optIndex];
      Quiz.answerRow(rowIndex, selected);
      // 答题中间态：只用蓝色标记当前选择，不揭示对错（整题提交后才标红绿）
      btns.forEach((b) => {
        if (b.getAttribute("data-r") !== String(rowIndex)) return;
        const i = +b.getAttribute("data-i");
        b.classList.remove("ok", "bad", "picked");
        if (i === optIndex) b.classList.add("picked");
      });
      // 全部行答完 → 锁定选项 + 整题反馈
      if ((q.rowResults || []).filter((v) => v !== undefined).length >= rows.length) {
        finishMultiRow(q);
      }
      return;
    }

    // ---- 单行题：原逻辑 ----
    const selected = q.options[optIndex];
    const res = Quiz.answer(selected);

    // 锁定选项
    btns.forEach((b, i) => {
      b.disabled = true;
      const opt = q.options[i];
      if (opt.isCorrect) b.classList.add("ok");
      else if (i === optIndex) b.classList.add("bad");
    });

    const corr = q.correct;

    // F5：作答后词语旁出现手动朗读图标
    showReplayIcon(q);
    if (res.correct) {
      const pairName = q.pair;
      feedback.innerHTML =
        '<div class="ant-alert success"><span>✔</span><span><b>回答正确！</b>' +
        explainCorrect(pairName, corr.tag) + "</span></div>";
      // 已掌握走右上角常驻按钮；这里仅保留「跳过」（立即下一题）
      actions.style.display = "flex";
      actions.innerHTML = '<button class="ant-btn" id="btnSkip">跳过</button>';
      $("#btnSkip").addEventListener("click", () => {
        clearTimeout(autoNextTimer);
        nextQuestion();
      });
      // F6：自动朗读 1 遍，播完再启动 1 秒自动切题倒计时
      speakThen(q, true);
    } else {
      speakThen(q, false); // 答错也自动朗读 1 遍（F1）
      feedback.innerHTML =
        '<div class="ant-alert error"><span>✘</span><span><b>回答错误</b>，正确读音为 <b>' +
        escapeHtml(corr.py) + "</b>（" + escapeHtml(Quiz.tagLabel(q.pair, corr.tag)) +
        "）。该字已自动加入错题本。</span></div>";
      actions.style.display = "flex";
      actions.innerHTML =
        '<button class="ant-btn primary" onclick="App.show(\'wrongbook\')">查看错题本</button>' +
        '<button class="ant-btn" onclick="App.nextQuestion()">继续下一题</button>';
    }
  }

  /* 多行题：全部行作答完毕后的整题反馈 */
  function finishMultiRow(q) {
    const res = Quiz.commitQuestion();
    showReplayIcon(q); // F5：整题完成后出现手动朗读图标
    // 整题提交：锁定选项，清中间态蓝标，按最终结果揭示红绿
    const picks = q.rowPicks || [];
    $$("#quizCard .quiz-option").forEach((b) => {
      b.disabled = true;
      const ri = +b.getAttribute("data-r");
      const i = +b.getAttribute("data-i");
      const row = q.rows[ri];
      if (!row) return;
      b.classList.remove("picked");
      if (row.options[i].isCorrect) b.classList.add("ok");
      else if (picks[ri] === row.options[i]) b.classList.add("bad");
    });
    const feedback = $("#quizCard .quiz-feedback");
    const actions = $("#quizCard .quiz-actions");
    if (res.correct) {
      feedback.innerHTML =
        '<div class="ant-alert success"><span>✔</span><span><b>回答正确！</b>' +
        "全部 " + q.rows.length + " 个字读音都对了。</span></div>";
      // 已掌握走右上角常驻按钮（多字题弹多选）；这里仅保留「跳过」
      actions.style.display = "flex";
      actions.innerHTML = '<button class="ant-btn" id="btnSkip">跳过</button>';
      $("#btnSkip").addEventListener("click", () => {
        clearTimeout(autoNextTimer);
        nextQuestion();
      });
      // F6：自动朗读 1 遍，播完再启动 1 秒自动切题倒计时
      speakThen(q, true);
    } else {
      speakThen(q, false); // 答错也自动朗读 1 遍（F1）
      const wrongRows = q.rows.filter((_, i) => !q.rowResults[i]);
      feedback.innerHTML =
        '<div class="ant-alert error"><span>✘</span><span><b>有 ' + wrongRows.length +
        " 个字答错</b>，正确读音已标出，答错的字已自动加入错题本。</span></div>";
      actions.style.display = "flex";
      actions.innerHTML =
        '<button class="ant-btn primary" onclick="App.show(\'wrongbook\')">查看错题本</button>' +
        '<button class="ant-btn" onclick="App.nextQuestion()">继续下一题</button>';
    }
  }

  function explainCorrect(pairName, tag) {
    if (pairName === "l/n") {
      return (
        tag === "l"
          ? "<b>l</b> 是边音（舌尖抵住上齿龈，气流从舌两侧通过），<b>n</b> 是鼻音（气流从鼻腔通过）。差异点在声母 <b>l / n</b>。"
          : "<b>n</b> 是鼻音（气流从鼻腔通过），<b>l</b> 是边音（气流从舌两侧通过）。差异点在声母 <b>n / l</b>。"
      );
    }
    const pre = tag === "in" || tag === "en";
    return (
      (pre
        ? "<b>" + tag + "</b> 是前鼻音（舌尖抵住上齿龈），" + tag + "g 是后鼻音（舌根抬起）。"
        : "<b>" + tag + "</b> 是后鼻音（舌根抬起），" + tag.slice(0, -1) + " 是前鼻音（舌尖抵住上齿龈）。") +
      "差异点在韵母 <b>n / ng</b>。"
    );
  }

  function nextQuestion() {
    Quiz.next();
    if (Quiz.isFinished()) finishQuiz();
    else renderQuiz();
  }

  function finishQuiz() {
    const summary = Quiz.finishRound();
    if (!summary) return;
    renderResult(summary);
    show("result");
  }

  /* ---------------- 复盘页 ---------------- */
  function renderResult(s) {
    const emoji = s.rate >= 90 ? "🏆" : s.rate >= 70 ? "🎉" : s.rate >= 50 ? "💪" : "🌱";
    const wrongCount = s.wrongList.length;
    const min = Math.floor(s.durationSec / 60);
    const sec = s.durationSec % 60;
    $("#resultBody").innerHTML =
      '<div class="ant-card result-hero">' +
      '<div class="result-emoji">' + emoji + "</div>" +
      '<div class="result-score">' + s.rate + "<small>%</small></div>" +
      '<div class="result-summary">本轮 ' + s.total + " 题 · 答对 " + s.correct + " · 答错 " + wrongCount +
      " · 用时 " + (min ? min + " 分 " : "") + sec + " 秒</div>" +
      '<div class="mt-5"><div class="progress" style="max-width:420px;margin:0 auto;height:12px">' +
      '<div class="bar" style="width:' + s.rate + '%"></div></div></div>' +
      '<div class="mt-5" style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap">' +
      '<button class="ant-btn primary lg" onclick="App.retryWrong()" ' + (wrongCount ? "" : "disabled") +
      ">错题重练（" + wrongCount + " 题）</button>" +
      '<button class="ant-btn lg" onclick="App.again()">再练一轮</button>' +
      '<button class="ant-btn lg" onclick="App.show(\'stats\')">查看统计</button>' +
      "</div>" +
      '<div class="mt-3" style="font-size:13px;color:var(--text-3)">' +
      wrongCount + " 道错题已自动加入错题本" +
      "</div></div>" +
      '<div class="mt-5 ant-card"><div class="card-body">' +
      '<div class="row-between" style="margin-bottom:12px">' +
      '<span style="font-size:15px;font-weight:500">本轮错题清单</span>' +
      '<span class="ant-tag red">' + wrongCount + " 题待重练</span></div>" +
      (wrongCount
        ? '<div class="table-wrap"><table class="ant-table"><thead><tr>' +
          "<th>字</th><th>词语</th><th>音对</th><th>你的选择</th><th>正确读音</th>" +
          "</tr></thead><tbody>" +
          s.wrongList
            .map(
              (w) =>
                "<tr><td class=\"word-cell\">" + escapeHtml(w.char) + "</td><td data-label=\"词语\">" + escapeHtml(w.word) +
                "</td><td><span class=\"ant-tag " + pairTagClass(w.pair) + '">' + escapeHtml(Quiz.pairMeta(w.pair).label) +
                '</span></td><td><span class="ant-tag red">' + escapeHtml(w.wrongPy) + "</span></td>" +
                '<td><b style="color:var(--success)">' + escapeHtml(w.correctPy) + "</b></td></tr>"
            )
            .join("") +
          "</tbody></table></div>"
        : emptyHint("本轮全部答对，太棒了！"))
      "</div></div>";
    window._lastSummary = s;
  }

  /* ---------------- 统计页 ---------------- */
  let statsRange = 7;
  function renderStats() {
    const stats = statsOf(statsRange);
    const series = trendSeries(stats, statsRange);
    const masteredCount = Object.keys(stats.mastered).length;
    const allTotal = totalEntries();

    $("#statsCards").innerHTML =
      statCard("总正确率", stats.totalRate == null ? "--" : stats.totalRate + "%") +
      statCard("累计练习", stats.total + " 题") +
      statCard("连续打卡", stats.streak + " 天") +
      statCard("已掌握", masteredCount + ' <span class="unit">/ ' + allTotal + " 字</span>");

    $("#statsCharts").innerHTML =
      '<div class="ant-card chart-box">' +
      '<div class="chart-title">最近 ' + statsRange + " 天正确率趋势</div>" +
      trendChart(series) +
      '<div class="chart-legend"><span><i style="background:var(--primary)"></i>正确率</span>' +
      '<span style="color:var(--text-3)">无练习的日子不显示数据点</span></div>' +
      "</div>" +
      '<div class="ant-card chart-box">' +
      '<div class="chart-title">各音对正确率分布</div>' +
      Quiz.PAIR_ORDER.map((p) => {
        const ps = stats.pairStats[p];
        const rate = ps.rate == null ? 0 : ps.rate;
        return (
          '<div class="pair-stat">' +
          '<div class="row"><span><span class="ant-tag ' + pairTagClass(p) + '">' + escapeHtml(ps.meta.label) +
          '</span></span><span class="right">' + (ps.rate == null ? "--" : ps.rate + "%") +
          " · " + ps.masteredCount + "/" + ps.meta.totalEntries + " 字已掌握</span></div>" +
          '<div class="progress"><div class="bar ' + pairTagClass(p) + '" style="width:' + rate + '%"></div></div>' +
          "</div>"
        );
      }).join("") +
      "</div>";
  }

  function trendChart(series) {
    const W = 500, H = 170, padL = 30, padR = 24, padT = 30, padB = 26;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxRate = 100;
    const x = (i) => padL + (series.length === 1 ? innerW / 2 : (innerW * i) / (series.length - 1));
    const y = (rate) => padT + innerH - (rate / maxRate) * innerH;

    const pts = series
      .map((s, i) => ({ ...s, i, x: x(i), y: s.rate == null ? null : y(s.rate) }))
      .filter((s) => s.rate != null);

    let line = "";
    if (pts.length >= 2) {
      line =
        '<polyline points="' + pts.map((p) => p.x + "," + p.y).join(" ") +
        '" fill="none" stroke="#1677FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    const dots = pts
      .map(
        (p) =>
          '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="#1677FF"/>' +
          (p.i === series.length - 1
            ? '<text x="' + (p.x - 6) + '" y="' + Math.max(p.y - 8, 12) +
              '" font-size="12" text-anchor="end" fill="#1677FF" font-weight="500">今天 ' + p.rate + "%</text>"
            : "")
      )
      .join("");

    const grid =
      [0, 50, 100]
        .map(
          (r) =>
            '<line x1="' + padL + '" y1="' + y(r) + '" x2="' + (W - padR) + '" y2="' + y(r) +
            '" stroke="#F0F0F0" stroke-width="1"' + (r === 0 ? "" : ' stroke-dasharray="3 3"') + "/>" +
            '<text x="' + (padL - 6) + '" y="' + (y(r) + 4) + '" font-size="10" fill="#A1A1AA" text-anchor="end">' + r + "</text>"
        )
        .join("");

    const labels = series
      .map(
        (s, i) =>
          '<text x="' + x(i) + '" y="' + (H - 8) + '" font-size="11" fill="#A1A1AA" text-anchor="middle">' +
          (i === series.length - 1 ? "今天" : s.label) + "</text>"
      )
      .join("");

    return (
      '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="正确率趋势折线图">' +
      grid + line + dots + labels + "</svg>"
    );
  }

  /* ---------------- 已掌握 ---------------- */
  let masteredFilter = "all";
  function renderMastered() {
    const stats = statsOf(7);
    const mastered = stats.mastered;
    const all = Object.values(mastered).sort((a, b) => b.time - a.time);
    const search = ($("#masteredSearch").value || "").trim();
    const allTotal = totalEntries();

    let list = all;
    if (masteredFilter !== "all") list = list.filter((m) => m.pair === masteredFilter);
    if (search) list = list.filter((m) => m.char.includes(search) || wordOf(m).includes(search));

    const pct = allTotal ? Math.round((all.length / allTotal) * 100) : 0;
    $("#masteredBody").innerHTML =
      '<div class="mt-5 ant-card"><div class="card-body">' +
      '<div class="row-between" style="margin-bottom:12px">' +
      '<span style="font-size:15px;font-weight:500">共 ' + all.length + " 字已掌握</span>" +
      '<span class="ant-tag blue">约 ' + pct + "% 已认全</span></div>" +
      '<div class="progress" style="margin-bottom:16px"><div class="bar" style="width:' + pct + '%"></div></div>' +
      '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap" id="mFilter">' +
      '<span class="ant-tag blue clickable' + (masteredFilter === "all" ? " filter-on" : "") + '" data-f="all">全部</span>' +
      Quiz.PAIR_ORDER.map(
        (p) =>
          '<span class="ant-tag ' + pairTagClass(p) + ' clickable' + (masteredFilter === p ? " filter-on" : "") + '" data-f="' + p + '">' +
          escapeHtml(Quiz.pairMeta(p).label) + "</span>"
      ).join("") +
      "</div>" +
      (list.length
        ? '<div class="table-wrap"><table class="ant-table"><thead><tr>' +
          "<th>字</th><th>词语</th><th>音对</th><th>正确读音</th><th>掌握时间</th><th>操作</th>" +
          "</tr></thead><tbody>" +
          list
            .map(
              (m) =>
                "<tr><td class=\"word-cell\">" + escapeHtml(m.char) + "</td><td data-label=\"词语\">" + escapeHtml(wordOf(m)) +
                "</td><td><span class=\"ant-tag " + pairTagClass(m.pair) + '">' + escapeHtml(Quiz.pairMeta(m.pair).label) +
                '</span></td><td><b>' + escapeHtml(readingOf(m.char, m.pair)) + "</b></td><td data-label=\"掌握时间\">" + fmtTime(m.time) +
                '</td><td class="ops"><a role="button" tabindex="0" onclick="App.revokeMastered(\'' + m.char + '\')">撤回</a></td></tr>'
            )
            .join("") +
          "</tbody></table></div>"
        : emptyHint("还没有已掌握的字，答题答对后标记即可"))
      "</div></div>";
    $$("#mFilter .ant-tag").forEach((t) =>
      t.addEventListener("click", () => {
        masteredFilter = t.getAttribute("data-f");
        renderMastered(); // 重渲染时按 masteredFilter 标出激活项（旧 outline 内联方案会被 innerHTML 重建抹掉）
      })
    );
    labelTables();
  }

  function wordOf(m) {
    const entry = Quiz.allEntries(m.pair).find((e) => e.char === m.char);
    if (entry && entry.words && entry.words[0]) return entry.words[0].word;
    return m.char;
  }
  function readingOf(char, pair) {
    const entry = Quiz.allEntries(pair).find((e) => e.char === char);
    return entry ? entry.reading : "--";
  }

  /* ---------------- 错题本 ---------------- */
  /* 有效错题（排除已掌握标记而隐藏的记录） */
  function activeWrongItems() {
    const wb = Store.getWrongBook();
    return Object.values(wb)
      .filter((it) => !it.hidden)
      .sort((a, b) => b.lastTime - a.lastTime);
  }
  function renderWrongbook() {
    const items = activeWrongItems();
    $("#wrongbookAction").innerHTML =
      '<button class="ant-btn primary lg" onclick="App.startWrongbook()" ' + (items.length ? "" : "disabled") +
      ">一键重练全部（" + items.length + " 题）</button>";
    $("#wrongbookBody").innerHTML =
      '<div class="mt-5 ant-card"><div class="card-body">' +
      '<div class="row-between" style="margin-bottom:12px">' +
      '<span style="font-size:15px;font-weight:500">错题列表</span>' +
      '<span class="ant-tag red">' + items.length + " 条</span></div>" +
      (items.length
        ? '<div class="table-wrap"><table class="ant-table"><thead><tr>' +
          "<th>字</th><th>词语</th><th>音对</th><th>你的选择</th><th>正确读音</th><th>出错次数</th><th>最近出错</th><th>操作</th>" +
          "</tr></thead><tbody>" +
          items
            .map(
              (it) =>
                "<tr><td class=\"word-cell\">" + escapeHtml(it.char) + "</td><td data-label=\"词语\">" + escapeHtml(it.word) +
                "</td><td><span class=\"ant-tag " + pairTagClass(it.pair) + '">' + escapeHtml(Quiz.pairMeta(it.pair).label) +
                '</span></td><td><span class="ant-tag red">' + escapeHtml(it.wrongPy) + "</span></td>" +
                '<td><b style="color:var(--success)">' + escapeHtml(it.correctPy) + "</b></td><td data-label=\"出错次数\">" + it.count + " 次</td>" +
                "<td data-label=\"最近出错\">" + fmtClock(it.lastTime) + "</td>" +
                '<td class="ops"><a role="button" tabindex="0" onclick="App.practiceOne(\'' + it.char + '\',\'' + it.pair + '\')">重练</a>' +
                '<a role="button" tabindex="0" class="danger" onclick="App.removeWrong(\'' + it.char + '\')">移除</a></td></tr>'
            )
            .join("") +
          "</tbody></table></div>"
        : emptyHint("错题本是空的，答错的字会自动出现在这里"))
      "</div></div>" +
      '<div class="mt-5 ant-alert info"><span>ℹ</span><span>错题去重累积（同一字多次出错只保留一条、累计次数）；重练时连续答对 2 次自动移出，也可手动移除。</span></div>';
  }

  /* ---------------- 设置：数据导出 / 导入 ---------------- */
  function renderSettings() {
    $("#settingsStats").innerHTML =
      statCard("答题流水", Store.getReviews().length + " 条") +
      statCard("字卡", Object.keys(Store.getCards()).length + " 张") +
      statCard("错题本", Object.keys(Store.getWrongBook()).filter((c) => !Store.getWrongBook()[c].hidden).length + " 条") +
      statCard("已掌握", Object.keys(Store.getMastered()).length + " 字");
    // FSRS 记忆调度开关状态
    const fsrsOn = !!Store.getSettings().enableFSRS;
    const toggle = $("#fsrsToggle");
    if (toggle) toggle.checked = fsrsOn;
    // TTS 朗读开关状态（不支持时禁用并提示）
    const ttsBox = $("#ttsToggle");
    if (ttsBox) {
      const usable = window.TTS && TTS.supported();
      ttsBox.checked = usable && TTS.enabled();
      ttsBox.disabled = !usable;
      if (!usable) $("#ttsDesc").textContent = "当前浏览器不支持语音朗读。";
    }
    const dueCount = Store.getDueKeys(Date.now(), 1000000).length;
    const cardCount = Object.keys(Store.getCards()).length;
    $("#fsrsStatus").innerHTML =
      "<span>" + (fsrsOn ? "✔" : "✘") + "</span><span>" +
      (fsrsOn
        ? "记忆调度已启用：到期字优先复习。当前待复习 <b>" + dueCount + "</b> 字，已建立 <b>" + cardCount + "</b> 张字卡（每个字 × 音对一张）。"
        : "记忆调度已关闭：出题为纯随机（旧逻辑），随时可重新开启。") +
      "</span>";

    // 云同步区块
    renderSyncSettings();
  }

  /* 云同步设置区渲染（本地密钥只读展示 / 远端密钥输入 / 自动同步开关 / 状态） */
  function renderSyncSettings() {
    const Sync = window.Sync;
    const st = Sync ? Sync.status() : { enabled: false, key: "", server: "", lastSyncAt: null, pending: false, error: null };
    const auto = $("#syncAutoToggle");
    if (auto) auto.checked = !!st.enabled;
    const server = $("#syncServer");
    if (server) server.value = st.server || "";
    // 远端密钥输入框：保持用户输入，绝不回填/自动生成
    // 本地密钥：只读展示当前绑定
    const hasKey = !!st.key;
    const local = $("#localKeyBox");
    if (local) {
      local.textContent = hasKey ? st.key : "（未绑定）";
      local.className = "sync-key-box" + (hasKey ? "" : " muted");
    }
    // 复制/重置按钮仅在有本地密钥时可用
    const copyBtn = $("#btnCopyKey");
    if (copyBtn) copyBtn.style.display = hasKey ? "" : "none";
    const resetBtn = $("#btnResetKey");
    if (resetBtn) resetBtn.style.display = hasKey ? "" : "none";
    const hint = $("#syncHint");
    if (hint) {
      hint.innerHTML = hasKey
        ? "<span>✔</span><span>本机已绑定密钥" + (st.enabled ? "，自动同步已开启：打开应用自动拉取、练习后自动推送。" : "，自动同步已关闭：练习数据不会自动上传，可随时点「立即同步」。") + "</span>"
        : "<span>ℹ</span><span>本机尚未绑定密钥：粘贴另一台设备的密钥后点「确定同步」，或点「生成新密钥」创建全新同步空间（请立即复制保存，丢失无法找回）。</span>";
    }
    const status = $("#syncStatus");
    if (status) {
      const parts = [];
      if (st.lastSyncAt) parts.push("上次同步 " + fmtClock(st.lastSyncAt));
      if (st.pending) parts.push("待推送");
      if (st.error) parts.push("错误:" + escapeHtml(st.error));
      status.textContent = parts.length ? parts.join(" · ") : "未同步";
      status.className = "ant-tag" + (st.error ? " red" : st.pending ? " pair-in" : "");
    }
  }

  /* 导出：打包全部数据为 JSON 文件下载 */
  function exportData() {
    const obj = Store.exportData();
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    a.href = url;
    a.download =
      "fpf-backup-" +
      d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" +
      pad(d.getHours()) + pad(d.getMinutes()) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("备份已导出，请妥善保存文件");
  }

  /* 导入：唤起文件选择 */
  function pickImportFile() {
    const input = $("#importFileInput");
    if (input) input.click();
  }

  /* 导入：读取文件 → 校验 → 合并写回 */
  function handleImportFile(evt) {
    const file = evt.target.files && evt.target.files[0];
    evt.target.value = ""; // 允许重复选择同一文件
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = Store.importData(String(reader.result));
      if (!res.ok) {
        toast("导入失败：" + res.error);
        return;
      }
      renderSettings();
      const m = res.merged;
      toast(
        "导入完成：新增流水 " + m.reviews + " 条、字卡 " + m.cards + " 张、错题 " +
        m.wrongBook + " 条、已掌握 " + m.mastered + " 字、轮次 " + m.history + " 条（与本地数据合并）"
      );
    };
    reader.onerror = () => toast("读取文件失败，请重试");
    reader.readAsText(file, "utf-8");
  }

  window.App = {
    /* ---------- 导航 ---------- */
    show,
    /* ---------- 首页动作 ---------- */
    startPair: (pair) => startQuiz("pair", pair),
    startMix: () => startQuiz("mix", null),
    startWrongbook: () => {
      const wb = Store.getWrongBook();
      // 排除已掌握而隐藏的记录
      const chars = Object.keys(wb).filter((c) => !wb[c].hidden);
      if (!chars.length) {
        toast("错题本是空的");
        return;
      }
      // 显式按错题数量出题，避免继承"无限模式"设置导致无限循环错题
      startQuiz("mix", null, { onlyChars: chars, count: chars.length, source: "wrongbook" });
    },
    practiceOne: (char, pair) => {
      startQuiz("pair", pair, { onlyChars: [char], source: "wrongbook", count: 1 });
    },
    retryWrong: () => {
      const s = window._lastSummary;
      if (!s || !s.wrongList.length) return;
      const chars = s.wrongList.map((w) => w.char);
      startQuiz(s.round.mode === "pair" ? "pair" : "mix", s.round.pair, {
        onlyChars: chars,
        count: chars.length,
        source: "retry",
      });
    },
    again: () => {
      const s = window._lastSummary;
      if (!s) return;
      startQuiz(s.round.mode === "pair" ? "pair" : "mix", s.round.pair);
    },
    /* ---------- 答题 ---------- */
    nextQuestion,
    prevQuestion,
    resumeLatest,
    toggleMastered,
    toggleTts,
    quitQuiz: () => {
      clearTimeout(autoNextTimer);
      const round = Quiz.getRound();
      if (round && round.infinite) {
        // 无限模式：确认后结束本轮并查看复盘
        const done = round.correctCount + round.wrongList.length;
        popconfirm(
          "结束本轮",
          "已答 " + done + " 题（答对 " + round.correctCount + "），确定结束并查看复盘吗？",
          () => finishQuiz()
        );
      } else {
        show("home");
      }
    },
    /* ---------- 已掌握 ---------- */
    revokeMastered: (char) => {
      popconfirm("撤回已掌握", "撤回后「" + char + "」将重新参与出题，确定吗？", () => {
        Store.removeMastered(char);
        toast("已撤回「" + char + "」");
        renderMastered();
      });
    },
    /* ---------- 错题本 ---------- */
    removeWrong: (char) => {
      popconfirm("移除错题", "确定将「" + char + "」从错题本移除吗？", () => {
        Store.removeWrong(char);
        toast("已从错题本移除");
        renderWrongbook();
      });
    },
    /* ---------- 统计 ---------- */
    setStatsRange: (d) => {
      statsRange = d;
      renderStats();
    },
    /* ---------- 设置 ---------- */
    exportData,
    pickImportFile,
  };

  /* ---------------- 全局事件 ---------------- */
  function quizKeyHandler(ev) {
    const view = $("#view-quiz");
    if (!view.classList.contains("active")) return;
    // 方向键 ←：回溯上一题（防止页面滚动）
    if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      prevQuestion();
      return;
    }
    if (!/^[1-4]$/.test(ev.key)) return;
    const idx = +ev.key - 1;
    const q = Quiz.currentQuestion();
    if (!q) return;
    if (q.rows) {
      // 多行题：数字键作用于第一个未作答的行
      const results = q.rowResults || [];
      let ri = -1;
      for (let i = 0; i < q.rows.length; i++) {
        if (results[i] === undefined) { ri = i; break; }
      }
      if (ri < 0 || idx >= q.rows[ri].options.length) return;
      submitAnswer(ri, idx);
    } else {
      if (idx >= q.options.length) return;
      submitAnswer(0, idx);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // 导航
    $$("#topNav a, #sider .menu-item").forEach((a) =>
      a.addEventListener("click", () => show(a.getAttribute("data-view")))
    );
    // 统计范围
    $$("#statsRange span").forEach((s) =>
      s.addEventListener("click", () => {
        $$("#statsRange span").forEach((x) => x.classList.toggle("active", x === s));
        App.setStatsRange(+s.getAttribute("data-range"));
      })
    );
    // 已掌握搜索
    $("#masteredSearch").addEventListener("input", renderMastered);
    // 导入文件选择
    $("#importFileInput").addEventListener("change", handleImportFile);
    // FSRS 记忆调度开关
    $("#fsrsToggle").addEventListener("change", (ev) => {
      Store.setSettings({ enableFSRS: ev.target.checked });
      renderSettings();
      toast(ev.target.checked ? "已启用记忆调度（到期字优先复习）" : "已切换回纯随机出题");
    });
    // TTS 朗读开关（设置页，与答题页右上角按钮同步）
    $("#ttsToggle").addEventListener("change", (ev) => {
      if (window.TTS) TTS.setEnabled(ev.target.checked);
      updateTtsToggle(); // 同步答题页按钮两态
      toast(ev.target.checked ? "朗读已开启" : "朗读已关闭");
    });
    // TTS 引擎无响应（Firefox 等未实现语音合成）：提示并停用功能
    if (window.TTS) {
      TTS.onDegraded = () => {
        updateTtsToggle();
        toast("当前浏览器语音引擎不可用，朗读已停用；建议改用 Chrome 或系统自带浏览器");
      };
    }
    // 自动同步开关（与密钥绑定解耦：只控制绑定后是否自动推送/拉取）
    $("#syncAutoToggle").addEventListener("change", (ev) => {
      const on = ev.target.checked;
      Store.setSettings({ enableSync: on });
      if (on && Store.getSettings().syncKey && Store.getSettings().syncServer) {
        Sync.init(); // 触发启动静默拉取
      }
      renderSettings();
      toast(on ? "已开启自动同步" : "已关闭自动同步（可手动「立即同步」）");
    });
    // 服务器地址保存
    $("#syncServer").addEventListener("change", (ev) => {
      Store.setSettings({ syncServer: String(ev.target.value || "").trim() });
      toast("同步服务器地址已保存");
      renderSettings();
    });
    // 确定同步：粘贴远端密钥 → 校验 → 绑定 → 立即同步一次 → 成功后本地密钥刷新
    $("#btnBindSync").addEventListener("click", async () => {
      const val = String(($("#remoteKeyInput") || {}).value || "").trim();
      if (!Sync.isValidKey(val)) {
        toast("密钥格式不正确（应为 fpf- 开头的长字符串），请检查后重试");
        return;
      }
      if (!Store.getSettings().syncServer) {
        toast("请先填写同步服务器地址");
        return;
      }
      // 本地已有练习数据时：双向合并会把本机数据推送到该密钥空间（换人/换设备时防污染）
      const localDataCount = Store.getReviews().length + Object.keys(Store.getCards()).length;
      if (localDataCount > 0) {
        popconfirm(
          "确认绑定该密钥？",
          "本机已有 " + localDataCount + " 条练习数据，绑定后将与该密钥的云端数据<b>双向合并</b>（本机数据会上传到该空间）。如想纯净恢复/切换身份，请先「导出备份」并「清除本地数据」。确定继续？",
          async () => {
            Store.setSettings({ syncKey: val });
            const ok = await Sync.syncNow();
            renderSyncSettings();
            if (ok) {
              $("#remoteKeyInput").value = ""; // 绑定成功，清空输入框
              toast("密钥已绑定并同步成功");
            } else {
              toast("同步失败：" + (Sync.status().error || "网络错误"));
            }
          }
        );
      } else {
        Store.setSettings({ syncKey: val });
        const ok = await Sync.syncNow();
        renderSyncSettings();
        if (ok) {
          $("#remoteKeyInput").value = ""; // 绑定成功，清空输入框
          toast("密钥已绑定并同步成功");
        } else {
          toast("同步失败：" + (Sync.status().error || "网络错误"));
        }
      }
    });
    // 立即同步：手动拉取合并 + 推送（不依赖自动开关）
    $("#btnManualSync").addEventListener("click", async () => {
      if (!Store.getSettings().syncKey || !Store.getSettings().syncServer) {
        toast("请先绑定密钥并填写服务器地址");
        return;
      }
      const ok = await Sync.syncNow();
      renderSyncSettings();
      toast(ok ? "同步完成" : "同步失败：" + (Sync.status().error || "网络错误"));
    });
    // 生成新密钥（新用户）：创建全新空间并绑定
    $("#btnGenKey").addEventListener("click", () => {
      // 本地已有练习数据时：生成新密钥 = 本机数据将推送到全新空间（换人使用/开新进度时防污染）
      const localDataCount = Store.getReviews().length + Object.keys(Store.getCards()).length;
      const warn =
        localDataCount > 0
          ? "本机已有 " + localDataCount + " 条练习数据，生成新密钥后这些数据将同步到<b>新空间</b>。若这些数据不属于你（他人浏览器/共享电脑），请先「导出备份」并「清除本地数据」再生成。"
          : "将生成一把全新密钥并创建新的同步空间。";
      popconfirm("生成新密钥", warn + " 若你已有密钥，请粘贴到上方「同步密钥（远端）」输入框后点「确定同步」。确定生成？", () => {
        Store.setSettings({ syncKey: Sync.generateKey() });
        renderSyncSettings();
        toast("已生成新密钥，请立即点「复制」保存（密钥丢失无法找回）");
      });
    });
    // 复制本地密钥
    $("#btnCopyKey").addEventListener("click", async () => {
      const k = Store.getSettings().syncKey;
      if (!k) return;
      try {
        await navigator.clipboard.writeText(k);
        toast("密钥已复制，可在其他设备设置页粘贴");
      } catch (e) {
        toast("自动复制失败，请手动复制：" + k);
      }
    });
    // 重置密钥（作废旧空间 + 生成新密钥；云端数据将被删除）
    $("#btnResetKey").addEventListener("click", () => {
      popconfirm("重置密钥", "将删除当前密钥对应云端空间里的全部数据，并生成新密钥。此操作不可恢复，强烈建议先导出备份。确定吗？", async () => {
        await Sync.resetSpace();
        Store.setSettings({ syncKey: Sync.generateKey() });
        toast("已生成新密钥");
        renderSettings();
      });
    });
    // 清除本地数据（换人使用/重新开始；云端数据不受影响）——双重确认
    $("#btnClearData").addEventListener("click", () => {
      const hasData = Store.getReviews().length + Object.keys(Store.getCards()).length > 0;
      popconfirm(
        "清除本地数据",
        "将删除本机全部练习记录、密钥与同步配置，且<b>不可恢复</b>！云端数据不受影响。强烈建议先「导出备份」。确定继续？",
        () => {
          popconfirm(
            "再次确认",
            "真的要清除本机全部数据吗？此操作无法撤销。若稍后想找回，只能靠之前导出的备份文件。确定清除？",
            () => {
              Store.clearAll();
              try { localStorage.removeItem("fpf_syncMeta"); } catch (e) { /* ignore */ }
              renderSettings();
              toast(hasData ? "本地数据已全部清除" : "本地数据已清除（本来就没有记录）");
            }
          );
        }
      );
    });
    // 云同步启动（若已配置：静默拉取合并）
    if (window.Sync) {
      Sync.init();
      // 同步状态变更后自动刷新设置页（若正在查看）
      Sync.setOnSync(() => {
        const v = $("#view-settings");
        if (v && v.classList.contains("active")) renderSyncSettings();
      });
    }
    // 键盘
    window.addEventListener("keydown", quizKeyHandler);
    // 无障碍：role="button" 的非原生按钮（导航项/表格操作链接）支持 Enter / Space 激活
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const t = ev.target;
      if (!t || !t.getAttribute || t.getAttribute("role") !== "button") return;
      if (t.tagName === "BUTTON" || t.tagName === "INPUT") return;
      ev.preventDefault();
      t.click();
    });
    // 初始渲染（支持 ?view=stats 深链接）
    const v = new URLSearchParams(location.search).get("view");
    show(v && ["home", "stats", "mastered", "wrongbook", "settings"].indexOf(v) >= 0 ? v : "home");
  });
})();
