/* ============================================================
   模糊音克星 · 应用控制器
   职责：视图切换（show）+ 练习入口（startQuiz 系列）+ App 全局动作
         + 全局事件绑定与初始化。
   渲染在 js/view-*.js（window.Views），共享 UI 工具在 js/ui.js（window.UI）。
   ============================================================ */
(function () {
  "use strict";

  const { $, $$, toast, popconfirm, labelTables } = window.UI;

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
      window.Views.quiz.onLeave();
    }
    window.scrollTo(0, 0);
    const dispatch = {
      home: () => window.Views.home.render(),
      stats: () => window.Views.stats.render(),
      mastered: () => window.Views.mastered.render(),
      wrongbook: () => window.Views.wrongbook.render(),
      settings: () => window.Views.settings.render(),
      quiz: () => window.Views.quiz.render(),
      result: () => {
        const s = window.Views.result.last();
        if (s) window.Views.result.render(s);
      },
    };
    if (dispatch[view]) dispatch[view]();
    labelTables();
  }

  /* ---------------- 练习入口 ---------------- */
  function startQuiz(mode, pair, opts) {
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
  }

  /* ---------------- App 全局动作（视图内 onclick 引用） ---------------- */
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
      const s = window.Views.result.last();
      if (!s || !s.wrongList.length) return;
      const chars = s.wrongList.map((w) => w.char);
      startQuiz(s.round.mode === "pair" ? "pair" : "mix", s.round.pair, {
        onlyChars: chars,
        count: chars.length,
        source: "retry",
      });
    },
    again: () => {
      const s = window.Views.result.last();
      if (!s) return;
      startQuiz(s.round.mode === "pair" ? "pair" : "mix", s.round.pair);
    },
    /* ---------- 答题（委托答题视图） ---------- */
    nextQuestion: () => window.Views.quiz.nextQuestion(),
    prevQuestion: () => window.Views.quiz.prevQuestion(),
    resumeLatest: () => window.Views.quiz.resumeLatest(),
    toggleMastered: () => window.Views.quiz.toggleMastered(),
    toggleTts: () => window.Views.quiz.toggleTts(),
    quitQuiz: () => window.Views.quiz.quitQuiz(),
    /* ---------- 已掌握 ---------- */
    revokeMastered: (char) => {
      popconfirm("撤回已掌握", "撤回后「" + char + "」将重新参与出题，确定吗？", () => {
        Store.removeMastered(char);
        toast("已撤回「" + char + "」");
        window.Views.mastered.render();
      });
    },
    /* ---------- 错题本 ---------- */
    removeWrong: (char) => {
      popconfirm("移除错题", "确定将「" + char + "」从错题本移除吗？", () => {
        Store.removeWrong(char);
        toast("已从错题本移除");
        window.Views.wrongbook.render();
      });
    },
    /* ---------- 统计 ---------- */
    setStatsRange: (d) => window.Views.stats.setRange(d),
    /* ---------- 设置 ---------- */
    exportData: () => window.Views.settings.exportData(),
    pickImportFile: () => window.Views.settings.pickImportFile(),
  };

  /* ---------------- 全局事件绑定与初始化 ---------------- */
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
    $("#masteredSearch").addEventListener("input", () => window.Views.mastered.render());
    // 导入文件选择
    $("#importFileInput").addEventListener("change", (ev) => window.Views.settings.handleImportFile(ev));
    // FSRS 记忆调度开关
    $("#fsrsToggle").addEventListener("change", (ev) => {
      Store.setSettings({ enableFSRS: ev.target.checked });
      window.Views.settings.render();
      toast(ev.target.checked ? "已启用记忆调度（到期字优先复习）" : "已切换回纯随机出题");
    });
    // TTS 朗读开关（设置页，与答题页右上角按钮同步）
    $("#ttsToggle").addEventListener("change", (ev) => {
      if (window.TTS) TTS.setEnabled(ev.target.checked);
      window.Views.quiz.updateTtsToggle(); // 同步答题页按钮两态
      toast(ev.target.checked ? "朗读已开启" : "朗读已关闭");
    });
    // TTS 引擎无响应（Firefox 等未实现语音合成）：提示并停用功能
    if (window.TTS) {
      TTS.onDegraded = () => {
        window.Views.quiz.updateTtsToggle();
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
      window.Views.settings.render();
      toast(on ? "已开启自动同步" : "已关闭自动同步（可手动「立即同步」）");
    });
    // 服务器地址保存
    $("#syncServer").addEventListener("change", (ev) => {
      Store.setSettings({ syncServer: String(ev.target.value || "").trim() });
      toast("同步服务器地址已保存");
      window.Views.settings.render();
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
      const bind = async () => {
        Store.setSettings({ syncKey: val });
        const ok = await Sync.syncNow();
        window.Views.settings.refreshSync();
        if (ok) {
          $("#remoteKeyInput").value = ""; // 绑定成功，清空输入框
          toast("密钥已绑定并同步成功");
        } else {
          toast("同步失败：" + (Sync.status().error || "网络错误"));
        }
      };
      if (localDataCount > 0) {
        popconfirm(
          "确认绑定该密钥？",
          "本机已有 " + localDataCount + " 条练习数据，绑定后将与该密钥的云端数据<b>双向合并</b>（本机数据会上传到该空间）。如想纯净恢复/切换身份，请先「导出备份」并「清除本地数据」。确定继续？",
          bind
        );
      } else {
        await bind();
      }
    });
    // 立即同步：手动拉取合并 + 推送（不依赖自动开关）
    $("#btnManualSync").addEventListener("click", async () => {
      if (!Store.getSettings().syncKey || !Store.getSettings().syncServer) {
        toast("请先绑定密钥并填写服务器地址");
        return;
      }
      const ok = await Sync.syncNow();
      window.Views.settings.refreshSync();
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
        window.Views.settings.refreshSync();
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
        window.Views.settings.render();
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
              window.Views.settings.render();
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
        if (v && v.classList.contains("active")) window.Views.settings.refreshSync();
      });
    }
    // 键盘（答题快捷键；常驻监听，handler 内部自守卫视图激活）
    window.addEventListener("keydown", window.Views.quiz.keyHandler);
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
