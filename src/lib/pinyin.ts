/* ============================================================
   模糊音克星 · 拼音辅助：声调提取/标调/音对互换/差异定位
   （从 js/quiz.js 拆出，纯函数化；渲染层用 diffIndex 定位高亮区间）
   ============================================================ */

const TONE_MAP: Record<string, number> = {
  ā: 1, á: 2, ǎ: 3, à: 4, ē: 1, é: 2, ě: 3, è: 4,
  ī: 1, í: 2, ǐ: 3, ì: 4, ō: 1, ó: 2, ǒ: 3, ò: 4,
  ū: 1, ú: 2, ǔ: 3, ù: 4, ǖ: 1, ǘ: 2, ǚ: 3, ǜ: 4,
};
const TONE_CHARS: Record<string, string> = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", ü: "ǖǘǚǜ" };

export function stripTone(py: string): string {
  return String(py).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

export function toneDigit(py: string): number | null {
  for (const ch of py) if (TONE_MAP[ch] !== undefined) return TONE_MAP[ch];
  return null; // 无调号（轻声）
}

/** 把调号标到 body 的正确元音上（a > o/e > ui/iu 标后 > 其余） */
function tonify(body: string, digit: number | null): string {
  if (!digit) return body;
  let idx = -1;
  if (body.includes("a")) idx = body.indexOf("a");
  else if (body.includes("o")) idx = body.indexOf("o");
  else if (body.includes("e")) idx = body.indexOf("e");
  else if (body.includes("ui")) idx = body.indexOf("ui") + 1;
  else if (body.includes("iu")) idx = body.indexOf("iu") + 1;
  else {
    for (let i = 0; i < body.length; i++) {
      if ("iuü".includes(body[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return body;
  const tones = TONE_CHARS[body[idx]];
  if (!tones) return body;
  return body.slice(0, idx) + tones[digit - 1] + body.slice(idx + 1);
}

/** 韵母互换：in<->ing、en<->eng（保留声调） */
export function swapVowel(py: string): string {
  const digit = toneDigit(py);
  const nt = stripTone(py);
  let body = nt;
  if (nt.endsWith("ing")) body = nt.slice(0, -3) + "in";
  else if (nt.endsWith("in")) body = nt.slice(0, -2) + "ing";
  else if (nt.endsWith("eng")) body = nt.slice(0, -3) + "en";
  else if (nt.endsWith("en")) body = nt.slice(0, -2) + "eng";
  else return py;
  return tonify(body, digit);
}

/** 声母互换：l<->n（保留声调） */
export function swapInitial(py: string): string {
  const digit = toneDigit(py);
  const nt = stripTone(py);
  let body = nt;
  if (nt[0] === "l") body = "n" + nt.slice(1);
  else if (nt[0] === "n") body = "l" + nt.slice(1);
  else return py;
  return tonify(body, digit);
}

/** 读音的音对标签（韵母优先） */
export function tagOf(py: string): string {
  const nt = stripTone(py);
  if (nt.endsWith("in")) return "in";
  if (nt.endsWith("ing")) return "ing";
  if (nt.endsWith("en")) return "en";
  if (nt.endsWith("eng")) return "eng";
  if (nt[0] === "l") return "l";
  if (nt[0] === "n") return "n";
  return "";
}

/** 鼻音韵母组（in/ing 或 en/eng）；非鼻音韵母返回 null */
export function vowelGroup(py: string): "in/ing" | "en/eng" | null {
  const nt = stripTone(py);
  if (nt.endsWith("in") || nt.endsWith("ing")) return "in/ing";
  if (nt.endsWith("en") || nt.endsWith("eng")) return "en/eng";
  return null;
}

/** 差异部分：in/ing → n/ng；en/eng → n/ng；l/n → l/n（声母） */
export function diffKeyOf(pairName: string, tag: string): string {
  if (pairName === "l/n") return tag; // 'l' 或 'n' 声母
  if (tag === "in" || tag === "en") return "n";
  if (tag === "ing" || tag === "eng") return "ng";
  return "";
}

/** 韵母/声母标签文本 */
export function tagLabel(pairName: string, tag: string): string {
  if (pairName === "l/n") return tag === "l" ? "l 声母" : "n 声母";
  return tag + " 韵母";
}

/** 差异高亮定位：返回拼音中应加粗区段的起始下标（-1 表示无高亮）。
    l/n → 声母位置；韵母对 → 结尾 n/ng 位置。区间长度 = diff.length */
export function diffIndex(py: string, pairName: string, diff: string): number {
  if (pairName === "l/n") {
    return py.search(/[lLnN]/);
  }
  const nt = py.toLowerCase();
  const i = nt.lastIndexOf(diff);
  return i >= 0 ? i : -1;
}
