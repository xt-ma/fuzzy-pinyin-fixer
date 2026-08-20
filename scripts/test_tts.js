/* TTS 模块测试：mock speechSynthesis / Store，验证开关、朗读、voice 选择与超时兜底（docs/tts-prd.md） */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; console.error("  ✘", name); }
}

/* ---- mock speechSynthesis ---- */
const spoken = []; // 入队的 utterance
let cancelCount = 0;
class MockUtterance {
  constructor(text) { this.text = text; this.rate = 1; this.lang = ""; }
}
const synthMock = {
  voices: [],
  addEventListener() {},
  getVoices() { return this.voices; },
  speak(u) { spoken.push(u); },
  cancel() { cancelCount++; },
};

function makeSandbox(withSynth) {
  const memStore = {};
  const sandbox = {
    window: {},
    document: { addEventListener() {} },
    localStorage: {
      getItem: (k) => (k in memStore ? memStore[k] : null),
      setItem: (k, v) => { memStore[k] = String(v); },
      removeItem: (k) => { delete memStore[k]; },
    },
    SpeechSynthesisUtterance: MockUtterance,
    console, Date, Math, setTimeout, clearTimeout, JSON,
    Object, Array, String, Number, Promise,
  };
  if (withSynth) sandbox.speechSynthesis = synthMock;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const load = (rel) =>
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf-8"), sandbox, { filename: rel });
  load("js/store.js");
  load("js/tts.js");
  return sandbox;
}

const sandbox = makeSandbox(true);
const TTS = sandbox.TTS;
const Store = sandbox.Store;

console.log("== 1. 基础能力与默认设置 ==");
ok(TTS.supported() === true, "有 speechSynthesis 时 supported() 为 true");
ok(Store.getSettings().ttsEnabled === true, "ttsEnabled 默认开启（PRD 评审结论）");

console.log("== 2. voice 选择优先级 ==");
const vPutong = { name: "Microsoft Huihui - 中文(简体) 普通话", lang: "zh-CN" };
const vTing = { name: "Tingting", lang: "zh-CN" };
const vZhCN = { name: "SomeVoice", lang: "zh-CN" };
const vZhTW = { name: "Meijia", lang: "zh-TW" };
const vEn = { name: "Google US English", lang: "en-US" };
ok(TTS._pickZhVoice([]) === null, "空列表返回 null");
ok(TTS._pickZhVoice([vEn]) === null, "无中文 voice 返回 null");
ok(TTS._pickZhVoice([vEn, vPutong, vTing]) === vPutong, "优先名称含「普通话」");
ok(TTS._pickZhVoice([vEn, vTing, vZhCN]) === vTing, "次选 Tingting 系");
ok(TTS._pickZhVoice([vEn, vZhCN, vZhTW]) === vZhCN, "再次 zh-CN");
ok(TTS._pickZhVoice([vZhTW]) === vZhTW, "兜底任意 zh");

(async () => {
  console.log("== 3. speak：开关、参数与 F6 时序 ==");
  let resolved = false;
  const p = TTS.speak("天津").then(() => { resolved = true; });
  ok(spoken.length === 1, "开关开启 → utterance 入队");
  const u = spoken[0];
  ok(u.text === "天津" && u.lang === "zh-CN", "文本与 lang 正确");
  ok(u.rate === 0.9, "语速 0.9（PRD F1）");
  await Promise.resolve(); // 让微任务跑完，确认未提前 resolve
  ok(resolved === false, "播完前 Promise 不 resolve（切题倒计时依赖它，F6）");
  u.onend();
  await p;
  ok(resolved === true, "onend 触发后 resolve");

  const before = cancelCount;
  const p2 = TTS.speak("北京");
  ok(cancelCount === before + 1, "speak 前先 cancel，防止快速作答堆叠");
  spoken[spoken.length - 1].onend();
  await p2;

  console.log("== 4. 开关与手动重听（F5） ==");
  TTS.setEnabled(false);
  ok(Store.getSettings().ttsEnabled === false, "setEnabled(false) 持久化");
  const n0 = spoken.length;
  await TTS.speak("上海");
  ok(spoken.length === n0, "开关关闭 → 不朗读");
  await TTS.speak("上海", { ignoreSwitch: true });
  ok(spoken.length === n0 + 1, "ignoreSwitch 绕过开关（手动点图标重听）");
  TTS.setEnabled(true);
  ok(Store.getSettings().ttsEnabled === true, "setEnabled(true) 持久化");

  console.log("== 5. F6 超时兜底（onend 不触发） ==");
  const t0 = Date.now();
  await TTS.speak("津"); // 1 字 → 350 + 500 = 850ms 超时上限
  const elapsed = Date.now() - t0;
  ok(elapsed >= 700 && elapsed < 3000, "onend 缺失时按估算时长自动 resolve（" + elapsed + "ms），流程不卡死");

  console.log("== 6. 不支持环境静默降级 ==");
  const box2 = makeSandbox(false);
  ok(box2.TTS.supported() === false, "无 speechSynthesis 时 supported() 为 false");
  await box2.TTS.speak("测试"); // 不应抛错
  ok(true, "不支持环境 speak 静默 resolve 不抛错");
  box2.TTS.stop(); // 不应抛错
  ok(true, "不支持环境 stop 不抛错");

  console.log("\n结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})();
