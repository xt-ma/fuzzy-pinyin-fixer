/* ============================================================
   模糊音克星 · 错题本视图（window.Views.wrongbook）
   错题列表 / 一键重练 / 单字重练与移除
   ============================================================ */
(function () {
  "use strict";
  const { $, escapeHtml, fmtClock, emptyHint, pairTagClass, labelTables } = window.UI;
  const Store = window.Store;
  const Quiz = window.Quiz;

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
        : emptyHint("错题本是空的，答错的字会自动出现在这里")) +
      "</div></div>" +
      '<div class="mt-5 ant-alert info"><span>ℹ</span><span>错题去重累积（同一字多次出错只保留一条、累计次数）；重练时连续答对 2 次自动移出，也可手动移除。</span></div>';
    labelTables();
  }

  window.Views = window.Views || {};
  window.Views.wrongbook = { render: renderWrongbook };
})();
