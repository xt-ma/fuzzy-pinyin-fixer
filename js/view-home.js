/* ============================================================
   模糊音克星 · 首页视图（window.Views.home）
   练习模式选择：音对卡 / 统计卡 / 操作行与题量选择 / 最近练习
   ============================================================ */
(function () {
  "use strict";
  const { $, $$, escapeHtml, toast, fmtClock, statCard, emptyHint, pairTagClass, labelTables, statsOf, trendSeries, totalEntries } = window.UI;
  const Store = window.Store;
  const Quiz = window.Quiz;

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
        : emptyHint("还没有练习记录，点击上方「开始综合练习」开始吧")) +
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

  function overallRateOf(stats) {
    const recs = stats.history.filter((r) => r.mode === "mix");
    const t = recs.reduce((s, r) => s + r.total, 0);
    const c = recs.reduce((s, r) => s + r.correct, 0);
    return t ? Math.round((c / t) * 100) : 0;
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

  window.Views = window.Views || {};
  window.Views.home = { render: renderHome };
})();
