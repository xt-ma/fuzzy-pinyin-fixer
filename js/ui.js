/* ============================================================
   模糊音克星 · 共享 UI 工具（window.UI）
   视图模块（js/view-*.js）与控制器（js/app.js）共用的
   DOM 辅助 / 弹窗 / 格式化 / 统计聚合 / 渲染工具。
   依赖：js/store.js、js/quiz.js（加载顺序在其后）
   ============================================================ */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* HTML 转义唯一实现（quiz.js 导出，此处复用） */
  function escapeHtml(s) {
    return window.Quiz.escapeHtml(s);
  }

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

  /* ---------------- 渲染小件 ---------------- */
  function statCard(label, value, delta) {
    return (
      '<div class="ant-card"><div class="card-body stat-card">' +
      '<div class="stat-label">' + label + "</div>" +
      '<div class="stat-value">' + value +
      (delta != null ? '<div class="stat-delta ' + (delta >= 0 ? "up" : "down") + '">' + (delta >= 0 ? "▲ " : "▼ ") + Math.abs(delta) + "%</div>" : "") +
      "</div></div></div>"
    );
  }
  function emptyHint(text) {
    return '<div class="empty-hint">' + escapeHtml(text) + "</div>";
  }
  function pairTagClass(pair) {
    return { "in/ing": "pair-in", "en/eng": "pair-en", "l/n": "pair-ln" }[pair] || "";
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

  /* ---------------- 词库查询辅助 ---------------- */
  function totalEntries() {
    return Quiz.PAIR_ORDER.reduce((s, p) => s + Quiz.allEntries(p).length, 0);
  }
  /* 已掌握记录/字卡 → 例词与读音（词库未收录时回退为字本身） */
  function wordOf(m) {
    const entry = Quiz.allEntries(m.pair).find((e) => e.char === m.char);
    if (entry && entry.words && entry.words[0]) return entry.words[0].word;
    return m.char;
  }
  function readingOf(char, pair) {
    const entry = Quiz.allEntries(pair).find((e) => e.char === char);
    return entry ? entry.reading : "--";
  }

  window.UI = {
    $,
    $$,
    escapeHtml,
    toast,
    popconfirm,
    fmtTime,
    fmtClock,
    statsOf,
    trendSeries,
    fmtDayLabel,
    statCard,
    emptyHint,
    pairTagClass,
    labelTables,
    totalEntries,
    wordOf,
    readingOf,
  };
})();
