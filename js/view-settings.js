/* ============================================================
   模糊音克星 · 设置视图（window.Views.settings）
   数据概况 / 云同步配置区 / 朗读与记忆调度开关 / 备份迁移
   （开关与按钮的事件绑定在控制器 js/app.js 初始化中）
   ============================================================ */
(function () {
  "use strict";
  const { $, escapeHtml, fmtClock, statCard, toast } = window.UI;
  const Store = window.Store;

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

  window.Views = window.Views || {};
  window.Views.settings = {
    render: renderSettings,
    refreshSync: renderSyncSettings,
    exportData,
    pickImportFile,
    handleImportFile,
  };
})();
