/* TTS 模块测试（移植自 scripts/test_tts.js）：mock speechSynthesis / Store，
   验证开关、朗读、voice 选择与超时兜底（docs/tts-prd.md）
   模块实例隔离：tts.ts 的模块级状态（zhVoice/inertMiss/degraded）随模块加载初始化，
   测试通过带查询串的动态 import 获取全新模块实例（Node/ESM 按完整标识符缓存）。 */

export {}; // 标记为 ES 模块（顶层 await 需要）
let pass = 0, fail = 0;
function ok(cond: unknown, name: string) {
  if (cond) { pass++; console.log("  ✔", name); }
  else { fail++; console.error("  ✘", name); }
}

/* ---- mock speechSynthesis ---- */
const spoken: { text: string; rate?: number; lang?: string; onstart?: () => void; onend?: () => void; onerror?: () => void }[] = [];
let cancelCount = 0;
class MockUtterance {
  text: string;
  rate = 1;
  lang = "";
  onstart?: () => void;
  onend?: () => void;
  onerror?: () => void;
  constructor(text: string) { this.text = text; }
}
const synthMock = {
  voices: [] as unknown[],
  addEventListener() {},
  getVoices() { return this.voices; },
  speak(u: { text: string; onstart?: () => void }) { spoken.push(u); if (u.onstart) u.onstart(); }, // 正常引擎：立即启动
  cancel() { cancelCount++; },
};

const g = globalThis as Record<string, unknown>;
let caseSeq = 0;

async function makeTTS(synthObj: unknown) {
  const mem: Record<string, string> = {};
  g.localStorage = {
    getItem: (k: string) => (k in mem ? mem[k] : null),
    setItem: (k: string, v: string) => { mem[k] = String(v); },
    removeItem: (k: string) => { delete mem[k]; },
  };
  if (synthObj === null) delete g.speechSynthesis;
  else g.speechSynthesis = synthObj;
  g.SpeechSynthesisUtterance = MockUtterance;
  // 带查询串的 import：全新模块实例（模块级状态隔离，等价旧版 vm 沙箱）
  return await import(`../src/lib/tts.ts?case=${++caseSeq}`);
}

/* voice 选择为纯函数：直接测默认实例 */
{
  const mod0 = await makeTTS(synthMock);
  const TTS0 = mod0.tts;
  console.log("== 2. voice 选择优先级 ==");
  const vPutong = { name: "Microsoft Huihui - 中文(简体) 普通话", lang: "zh-CN" };
  const vTing = { name: "Tingting", lang: "zh-CN" };
  const vZhCN = { name: "SomeVoice", lang: "zh-CN" };
  const vZhTW = { name: "Meijia", lang: "zh-TW" };
  const vEn = { name: "Google US English", lang: "en-US" };
  ok(TTS0._pickZhVoice([]) === null, "空列表返回 null");
  ok(TTS0._pickZhVoice([vEn]) === null, "无中文 voice 返回 null");
  ok(TTS0._pickZhVoice([vEn, vPutong, vTing]) === vPutong, "优先名称含「普通话」");
  ok(TTS0._pickZhVoice([vEn, vTing, vZhCN]) === vTing, "次选 Tingting 系");
  ok(TTS0._pickZhVoice([vEn, vZhCN, vZhTW]) === vZhCN, "再次 zh-CN");
  ok(TTS0._pickZhVoice([vZhTW]) === vZhTW, "兜底任意 zh");
}

const mod = await makeTTS(synthMock);
const TTS = mod.tts;
const { store } = await import("../src/lib/storage.ts");

console.log("== 1. 基础能力与默认设置 ==");
ok(TTS.supported() === true, "有 speechSynthesis 时 supported() 为 true");
ok(store.getSettings().ttsEnabled === true, "ttsEnabled 默认开启（PRD 评审结论）");

(async () => {
  console.log("== 3. speak：开关、参数与 F6 时序 ==");
  const state = { resolved: false };
  const p = TTS.speak("天津").then(() => { state.resolved = true; });
  ok(spoken.length === 1, "开关开启 → utterance 入队");
  const u = spoken[0];
  ok(u.text === "天津" && u.lang === "zh-CN", "文本与 lang 正确");
  ok(u.rate === 0.9, "语速 0.9（PRD F1）");
  await Promise.resolve(); // 让微任务跑完，确认未提前 resolve
  ok(state.resolved === false, "播完前 Promise 不 resolve（切题倒计时依赖它，F6）");
  u.onend!();
  await p;
  ok(state.resolved === true, "onend 触发后 resolve");

  const before = cancelCount;
  const p2 = TTS.speak("北京");
  ok(cancelCount === before + 1, "speak 前先 cancel，防止快速作答堆叠");
  spoken[spoken.length - 1].onend!();
  await p2;

  console.log("== 4. 开关与手动重听（F5） ==");
  TTS.setEnabled(false);
  ok(store.getSettings().ttsEnabled === false, "setEnabled(false) 持久化");
  const n0 = spoken.length;
  await TTS.speak("上海");
  ok(spoken.length === n0, "开关关闭 → 不朗读");
  await TTS.speak("上海", { ignoreSwitch: true });
  ok(spoken.length === n0 + 1, "ignoreSwitch 绕过开关（手动点图标重听）");
  spoken[spoken.length - 1].onend!();
  TTS.setEnabled(true);
  ok(store.getSettings().ttsEnabled === true, "setEnabled(true) 持久化");

  console.log("== 5. F6 超时兜底（onend 不触发） ==");
  const t0 = Date.now();
  await TTS.speak("津"); // 1 字 → 350 + 500 = 850ms 超时上限
  const elapsed = Date.now() - t0;
  ok(elapsed >= 700 && elapsed < 3000, `onend 缺失时按估算时长自动 resolve（${elapsed}ms），流程不卡死`);

  console.log("== 6. 不支持环境静默降级 ==");
  const box2 = await makeTTS(null);
  ok(box2.tts.supported() === false, "无 speechSynthesis 时 supported() 为 false");
  await box2.tts.speak("测试"); // 不应抛错
  ok(true, "不支持环境 speak 静默 resolve 不抛错");
  box2.tts.stop(); // 不应抛错
  ok(true, "不支持环境 stop 不抛错");

  console.log("== 7. 无响应引擎自动降级（Firefox/GeckoView 等） ==");
  const inertSynth = {
    voices: [],
    addEventListener() {},
    getVoices() { return []; },
    speak() {}, // 空实现：从不触发事件回调
    cancel() {},
  };
  const box3 = await makeTTS(inertSynth);
  const state3 = { degraded: false };
  box3.tts.onDegraded = () => { state3.degraded = true; };
  await box3.tts.speak("一"); // 800ms 未启动 → inertMiss=1；850ms 兜底 resolve
  ok(box3.tts.supported() === true, "单次未启动不误判（避免慢启动误伤）");
  await box3.tts.speak("二"); // inertMiss=2 → 降级
  ok(box3.tts.supported() === false, "连续两次未启动 → 判定引擎不可用");
  ok(state3.degraded === true, "onDegraded 回调已触发（UI 提示入口）");
  await box3.tts.speak("三");
  ok(true, "降级后 speak 静默 resolve 不抛错");

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
