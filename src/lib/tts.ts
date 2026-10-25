/* ============================================================
   模糊音克星 · TTS 朗读模块（docs/tts-prd.md）
   基于 Web Speech API（speechSynthesis），调用设备系统自带
   中文语音包，离线可用；不支持的环境静默降级。
   speechSynthesis/SpeechSynthesisUtterance 经 globalThis 惰性解析
   （Node 测试注入 mock；模块级状态随模块实例隔离，测试用
   带查询串的 import 获取全新模块实例）。
   ============================================================ */
import { store } from "./storage.ts";

interface SynthLike {
  getVoices(): { name?: string; lang?: string }[];
  speak(u: { onstart?: () => void; onend?: () => void; onerror?: () => void }): void;
  cancel(): void;
  addEventListener?(t: string, fn: () => void): void;
}

function getSynth(): SynthLike | null {
  const g = globalThis as unknown as { speechSynthesis?: SynthLike };
  return g.speechSynthesis || null;
}

var synth = getSynth(); // 模块加载时捕获（与旧版时序一致；测试以 ?case 重载）
var zhVoice: { name?: string; lang?: string } | null = null; // 缓存选中的中文 voice（列表异步加载）
var inertMiss = 0; // 连续未触发 onstart 的次数（探测无响应引擎，如 Firefox）
var degraded = false; // 引擎判定不可用后停用全部功能
var RATE = 0.9; // 略慢于默认，利于辨音学习（PRD F1）
var MS_PER_CHAR = 350; // 估算时长：每字 350ms（F6 超时兜底）
var FALLBACK_BUFFER = 500; // 估算时长缓冲

export const tts = {
  /** 引擎判定不可用回调（Firefox 等未实现 TTS 时，UI 提示入口） */
  onDegraded: null as null | (() => void),

  supported(): boolean {
    const g = globalThis as unknown as { SpeechSynthesisUtterance?: unknown };
    return !degraded && !!(synth && typeof g.SpeechSynthesisUtterance === "function");
  },

  enabled(): boolean {
    return !!store.getSettings().ttsEnabled;
  },

  setEnabled(on: boolean): void {
    store.setSettings({ ttsEnabled: !!on });
  },

  stop(): void {
    if (synth) synth.cancel();
  },

  /** 朗读文本 1 次，返回 Promise：播完 / 出错 / 被 cancel 时 resolve。
      opts.ignoreSwitch = true → 跳过开关检查（手动点朗读图标用，PRD F5）。
      F6 兜底：onend 个别浏览器可能不触发，用估算时长超时竞速，保证不卡死。 */
  speak(text: string, opts?: { ignoreSwitch?: boolean }): Promise<void> {
    opts = opts || {};
    const g = globalThis as unknown as { SpeechSynthesisUtterance?: new (text: string) => {
      onstart?: () => void;
      onend?: () => void;
      onerror?: () => void;
      lang?: string;
      voice?: { name?: string; lang?: string };
      rate?: number;
    } };
    if (!text || !this.supported() || (!opts.ignoreSwitch && !this.enabled())) {
      return Promise.resolve();
    }
    this.stop(); // 打断残留语音，避免快速作答堆叠
    refreshVoice();
    const synthObj = synth!;
    return new Promise<void>(function (resolve) {
      const u = new g.SpeechSynthesisUtterance!(text);
      u.lang = "zh-CN";
      if (zhVoice) u.voice = zhVoice;
      u.rate = RATE;
      var done = false;
      var started = false;
      var timer = setTimeout(finish, text.length * MS_PER_CHAR + FALLBACK_BUFFER);
      var startCheck = setTimeout(function () {
        // 引擎无响应：连续 2 次未启动则判定不可用（避免单次偏慢误判）
        if (!started && !done) {
          inertMiss += 1;
          if (inertMiss >= 2) degrade();
        }
      }, 800);
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(startCheck);
        resolve();
      }
      u.onstart = function () {
        started = true;
        inertMiss = 0;
      };
      u.onend = finish;
      u.onerror = finish;
      synthObj.speak(u);
    });
  },

  /* 内部函数外泄，仅供单元测试 */
  _pickZhVoice: pickZhVoice,
  _estimateMs: function (text: string): number {
    return text.length * MS_PER_CHAR + FALLBACK_BUFFER;
  },
};

/* 引擎无响应（Firefox/GeckoView 未实现 TTS）：停用功能并通知 UI 层提示 */
function degrade(): void {
  if (degraded) return;
  degraded = true;
  if (synth) synth.cancel();
  if (typeof tts.onDegraded === "function") tts.onDegraded();
}

/* voice 选择：lang 以 zh 开头，名称优先级 普通话 > Tingting/Yaoyao > zh-CN > zh */
function pickZhVoice(voices: { name?: string; lang?: string }[]): { name?: string; lang?: string } | null {
  if (!voices || !voices.length) return null;
  const zh = voices.filter(function (v) {
    return v && typeof v.lang === "string" && v.lang.toLowerCase().indexOf("zh") === 0;
  });
  if (!zh.length) return null;
  function has(v: { name?: string }, kw: string) {
    return !!v.name && v.name.indexOf(kw) !== -1;
  }
  const byName = function (kws: string[]) {
    return zh.filter(function (v) {
      return kws.some(function (k) {
        return has(v, k);
      });
    })[0] || null;
  };
  return (
    byName(["普通话"]) ||
    byName(["Tingting", "Yaoyao", "婷婷"]) ||
    zh.filter(function (v) {
      return v.lang!.toLowerCase() === "zh-cn" || v.lang!.toLowerCase() === "zh_cn";
    })[0] ||
    zh[0]
  );
}

function refreshVoice(): void {
  if (!synth || zhVoice) return;
  zhVoice = pickZhVoice(synth.getVoices());
}
if (synth) {
  refreshVoice();
  // 部分浏览器首次 getVoices() 为空，语音列表就绪后触发 voiceschanged
  synth.addEventListener && synth.addEventListener("voiceschanged", refreshVoice);
}
