/* ============================================================
   模糊音克星 · 轮末复盘视图（window.Views.result）
   本轮正确率 / 错题清单 / 重练入口
   ============================================================ */
(function () {
  "use strict";
  const { $, escapeHtml, emptyHint, pairTagClass } = window.UI;
  const Quiz = window.Quiz;

  let lastSummary = null; // 本轮复盘数据（重练/再练一轮入口使用）

  function renderResult(s) {
    lastSummary = s;
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
        : emptyHint("本轮全部答对，太棒了！")) +
      "</div></div>";
  }

  window.Views = window.Views || {};
  window.Views.result = {
    render: renderResult,
    last: () => lastSummary,
  };
})();
