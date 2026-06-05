import type { RoleplayDashboardBriefing } from "@/lib/roleplay/roleplay-types-api";

/** 併入 Gemini prompt：分數／場次一律半形阿拉伯數字，且遵循中英文混排空格 */
export const BRIEFING_LLM_NUMERAL_RULE =
  "所有分數、場次、平均、序號、百分比一律使用半形阿拉伯數字（0-9），禁止中文數字（如七十四、五場）。" +
  "中英文混排時，中文與半形英文／數字之間須加半形空格，例如「74 分」「5 場」「近 5 場 62→74」「X-TRAIL 綜合油耗約 14.3 km/L」。";

const CJK_CHAR = "[\\u4e00-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff]";
const ASCII_ALNUM = "[A-Za-z0-9]";
const CJK_ASCII_RE = new RegExp(`(${CJK_CHAR})(${ASCII_ALNUM})`, "g");
const ASCII_CJK_RE = new RegExp(`(${ASCII_ALNUM})(${CJK_CHAR})`, "g");

const CN_DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const CN_NUMERAL_RE = /[零〇一二兩三四五六七八九十百]+/g;

function parseChineseNumeral(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  if (s === "十") return 10;
  if (s === "百") return 100;

  if (s.includes("百")) {
    const [h, rest] = s.split("百");
    const hundreds = h === "" ? 1 : (CN_DIGIT[h] ?? null);
    if (hundreds == null) return null;
    const tail = rest ? parseChineseNumeral(rest) : 0;
    if (tail == null) return null;
    return hundreds * 100 + tail;
  }

  if (s.includes("十")) {
    const [a, b] = s.split("十");
    const tens = a === "" ? 1 : (CN_DIGIT[a] ?? null);
    if (tens == null) return null;
    const ones = b === "" ? 0 : (CN_DIGIT[b] ?? null);
    if (ones == null) return null;
    return tens * 10 + ones;
  }

  if (s.length === 1 && CN_DIGIT[s] != null) return CN_DIGIT[s];
  return null;
}

/** 將小結文字中的中文數字轉為阿拉伯數字（LLM 漏改時兜底） */
export function normalizeBriefingNumerals(text: string): string {
  return text.replace(CN_NUMERAL_RE, (match) => {
    const n = parseChineseNumeral(match);
    return n != null ? String(n) : match;
  });
}

/** 中英文混排：中文與半形英文／數字相鄰時補半形空格 */
export function normalizeBriefingCjkSpacing(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i += 1) {
    const next = out
      .replace(CJK_ASCII_RE, "$1 $2")
      .replace(ASCII_CJK_RE, "$1 $2")
      .replace(/ {2,}/g, " ");
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

/** 小結單行文字正規化（數字 + 混排空格） */
export function normalizeBriefingText(text: string): string {
  return normalizeBriefingCjkSpacing(normalizeBriefingNumerals(text));
}

export function normalizeBriefingLines(
  briefing: RoleplayDashboardBriefing,
): RoleplayDashboardBriefing {
  const knowledgeLines = (briefing.knowledgeLines ?? []).map(normalizeBriefingText);
  return {
    strengthLine: normalizeBriefingText(briefing.strengthLine),
    weaknessLine: normalizeBriefingText(briefing.weaknessLine),
    trendLine: normalizeBriefingText(briefing.trendLine),
    adviceLine: normalizeBriefingText(briefing.adviceLine),
    knowledgeLines,
  };
}
