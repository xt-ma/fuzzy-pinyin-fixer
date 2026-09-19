/* ============================================================
   模糊音克星 · 已掌握视图（window.Views.mastered）
   掌握进度 / 音对筛选 / 字表与撤回
   ============================================================ */
(function () {
  "use strict";
  const { $, $$, escapeHtml, fmtTime, emptyHint, pairTagClass, statsOf, labelTables, readingOf, wordOf, totalEntries } = window.UI;
  const Quiz = window.Quiz;

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
        : emptyHint("还没有已掌握的字，答题答对后标记即可")) +
      "</div></div>";
    $$("#mFilter .ant-tag").forEach((t) =>
      t.addEventListener("click", () => {
        masteredFilter = t.getAttribute("data-f");
        renderMastered(); // 重渲染时按 masteredFilter 标出激活项（旧 outline 内联方案会被 innerHTML 重建抹掉）
      })
    );
    labelTables();
  }

  window.Views = window.Views || {};
  window.Views.mastered = { render: renderMastered };
})();
