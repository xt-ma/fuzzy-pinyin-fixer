/* ============================================================
   模糊音克星 · 答题视图（window.Views.quiz）
   出题渲染 / 逐行与单行作答 / 对错反馈 / 已掌握标记 / 回溯 /
   TTS 朗读接入（docs/tts-prd.md）/ 无限模式与结束轮次
   ============================================================ */
(function () {
  "use strict";
  const { $, $$, escapeHtml, toast, popconfirm, pairTagClass } = window.UI;
  const Store = window.Store;
  const Quiz = window.Quiz;

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
    window.Views.result.render(summary);
    window.App.show("result");
  }

  /* 结束本轮（无限模式确认后复盘；普通模式返回首页） */
  function quitQuiz() {
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
      window.App.show("home");
    }
  }

  /* 离开答题页：清理待切题计时与残留朗读（keydown 监听常驻，handler 自守卫） */
  function onLeave() {
    clearTimeout(autoNextTimer);
    if (window.TTS) TTS.stop();
  }

  /* 键盘：数字键作答当前行 / ← 回溯上一题 */
  function keyHandler(ev) {
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

  window.Views = window.Views || {};
  window.Views.quiz = {
    render: renderQuiz,
    onLeave,
    keyHandler,
    nextQuestion,
    prevQuestion,
    resumeLatest,
    toggleMastered,
    toggleTts,
    updateTtsToggle,
    quitQuiz,
  };
})();
