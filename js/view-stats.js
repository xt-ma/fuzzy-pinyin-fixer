/* ============================================================
   模糊音克星 · 统计视图（window.Views.stats）
   统计卡 / 正确率趋势（SVG）/ 音对分布 / 薄弱字 TOP 排行
   ============================================================ */
(function () {
  "use strict";
  const { $, escapeHtml, statCard, emptyHint, pairTagClass, statsOf, trendSeries, fmtClock, wordOf, totalEntries } = window.UI;
  const Store = window.Store;
  const Quiz = window.Quiz;

  let statsRange = 7;

  /* 薄弱字：字卡聚合（cards 按 pair:char 累计对错），按累计错误次数降序、
     同次数按正确率升序、再按最近作答，取前 N */
  function weakCardsOf(limit) {
    return Object.values(Store.getCards())
      .filter((c) => c && c.wrongCount > 0)
      .sort(
        (a, b) =>
          b.wrongCount - a.wrongCount ||
          a.correctCount / (a.reps || 1) - b.correctCount / (b.reps || 1) ||
          b.lastTs - a.lastTs
      )
      .slice(0, limit || 10);
  }

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

    // 薄弱字 TOP：cards 聚合 + 单字重练入口
    const weak = weakCardsOf(10);
    $("#statsWeak").innerHTML =
      '<div class="ant-card chart-box">' +
      '<div class="row-between" style="margin-bottom:12px">' +
      '<span style="font-size:15px;font-weight:500">薄弱字 TOP 10</span>' +
      '<span class="ant-tag ' + (weak.length ? "red" : "") + '">' + weak.length + " 字</span></div>" +
      (weak.length
        ? '<div class="table-wrap"><table class="ant-table"><thead><tr>' +
          "<th>字</th><th>词语</th><th>音对</th><th>练习</th><th>正确率</th><th>最近作答</th><th>操作</th>" +
          "</tr></thead><tbody>" +
          weak
            .map((c) => {
              const acc = Math.round((c.correctCount / (c.reps || 1)) * 100);
              const accTag = acc >= 80 ? "green" : acc >= 50 ? "" : "red";
              return (
                "<tr><td class=\"word-cell\">" + escapeHtml(c.char) + "</td><td data-label=\"词语\">" + escapeHtml(wordOf(c)) +
                "</td><td><span class=\"ant-tag " + pairTagClass(c.pair) + '">' + escapeHtml(Quiz.pairMeta(c.pair).label) +
                '</span></td><td data-label="练习">' + c.reps + " 次</td>" +
                '<td data-label="正确率"><span class="ant-tag ' + accTag + '">' + acc + "%</span></td>" +
                '<td data-label="最近作答">' + fmtClock(c.lastTs) + "</td>" +
                '<td class="ops"><a role="button" tabindex="0" onclick="App.practiceOne(\'' + c.char + '\',\'' + c.pair + '\')">重练</a></td></tr>'
              );
            })
            .join("") +
          "</tbody></table></div>" +
          '<div class="chart-legend" style="margin-top:10px"><span style="color:var(--text-3)">按累计错误次数排序；开启记忆调度后，生疏字也会更频繁地自动安排复习。</span></div>'
        : emptyHint("暂无薄弱字：答错的字会按错误次数汇总在这里")) +
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

  window.Views = window.Views || {};
  window.Views.stats = {
    render: renderStats,
    setRange: (d) => { statsRange = d; renderStats(); },
  };
})();
