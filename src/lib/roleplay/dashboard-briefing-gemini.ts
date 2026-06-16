import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import {
  abandonedSessionMin,
  BRIEFING_ADVICE_LINE_MAX_CHARS,
  BRIEFING_DIM_LINE_MAX_CHARS,
  BRIEFING_KNOWLEDGE_LINE_MAX_CHARS,
  BRIEFING_TREND_LINE_MAX_CHARS,
  trimBriefingLine,
} from "@/lib/roleplay/dashboard-briefing-cache";
import {
  buildRuleDashboardBriefing,
  appendAbandonedReminder,
} from "@/lib/roleplay/dashboard-briefing";
import {
  isValidCorrectionMemoryLine,
  isValidFactMemoryLine,
} from "@/lib/roleplay/briefing-correction-summary";
import {
  BRIEFING_LLM_NUMERAL_RULE,
  normalizeBriefingLines,
} from "@/lib/roleplay/briefing-numeral-format";
import type {
  RoleplayDashboardBriefing,
  RoleplayDashboardStats,
} from "@/lib/roleplay/roleplay-types-api";

export type BriefingGeminiPayload = {
  startedSessions: number;
  completedSessions: number;
  abandonedSessions: number;
  overallAvg: number;
  lastScore: number | null;
  dimensionAverages: RoleplayDashboardStats["dimensionAverages"];
  strongest: { id: string; label: string; score: number | null }[];
  weakest: { id: string; label: string; score: number | null }[];
  last5Scores: number[];
  byDifficulty: RoleplayDashboardStats["byDifficulty"];
  practiceSuggestions: RoleplayDashboardStats["suggestions"];
  knowledgeReminders: string[];
  correctionMemoryLines: string[];
  factMemoryLines: string[];
  strategyAdviceFromCorrections: string;
};

export type BriefingActivityDelta = {
  trigger: "gate1" | "gate2";
  sessionId: string;
  /** gate2 完賽分數 */
  score?: number;
  grade?: string;
  dimensionScores?: { id: string; label: string; score: number }[];
  improvementTips?: string[];
  scenarioFacts?: { label: string; value: string }[];
};

export function buildBriefingPayload(
  stats: Omit<RoleplayDashboardStats, "briefing" | "briefingStale">,
): BriefingGeminiPayload {
  const abandoned = Math.max(0, stats.startedSessions - stats.completedSessions);
  return {
    startedSessions: stats.startedSessions,
    completedSessions: stats.completedSessions,
    abandonedSessions: abandoned,
    overallAvg: stats.overallAvg,
    lastScore: stats.lastScore,
    dimensionAverages: stats.dimensionAverages,
    strongest: stats.strongestDimensions.map((id) => ({
      id,
      label: stats.dimensionLabels[id] ?? id,
      score: stats.dimensionAverages?.[id as keyof typeof stats.dimensionAverages] ?? null,
    })),
    weakest: stats.weakestDimensions.map((id) => ({
      id,
      label: stats.dimensionLabels[id] ?? id,
      score: stats.dimensionAverages?.[id as keyof typeof stats.dimensionAverages] ?? null,
    })),
    last5Scores: stats.scoreTrend.slice(-5).map((p) => p.score),
    byDifficulty: stats.byDifficulty,
    practiceSuggestions: stats.suggestions.slice(0, 2),
    knowledgeReminders: stats.knowledgeReminders ?? [],
    correctionMemoryLines: stats.correctionMemoryLines ?? [],
    factMemoryLines: stats.factMemoryLines ?? [],
    strategyAdviceFromCorrections: stats.strategyAdviceFromCorrections ?? "無",
  };
}

function parseKnowledgeLines(raw: unknown, fallback: string[]): string[] {
  const validFallback = fallback.filter((l) => isValidCorrectionMemoryLine(l));
  if (!Array.isArray(raw)) return validFallback.slice(0, 12);
  const lines = raw
    .map((x) => trimBriefingLine(x, "", BRIEFING_KNOWLEDGE_LINE_MAX_CHARS))
    .filter(Boolean)
    .filter((l) => isValidCorrectionMemoryLine(l));
  if (lines.length > 0) return lines.slice(0, 12);
  return validFallback.slice(0, 12);
}

function parseBriefingJsonResponse(
  raw: string | null,
  fallback: RoleplayDashboardBriefing,
): RoleplayDashboardBriefing {
  if (!raw) return normalizeBriefingLines(fallback);
  try {
    const j = JSON.parse(raw) as Partial<RoleplayDashboardBriefing>;
    return normalizeBriefingLines({
      strengthLine: trimBriefingLine(
        j.strengthLine,
        fallback.strengthLine,
        BRIEFING_DIM_LINE_MAX_CHARS,
      ),
      weaknessLine: trimBriefingLine(
        j.weaknessLine,
        fallback.weaknessLine,
        BRIEFING_DIM_LINE_MAX_CHARS,
      ),
      trendLine: trimBriefingLine(
        j.trendLine,
        fallback.trendLine,
        BRIEFING_TREND_LINE_MAX_CHARS,
      ),
      adviceLine: trimBriefingLine(
        j.adviceLine,
        fallback.adviceLine,
        BRIEFING_ADVICE_LINE_MAX_CHARS,
      ),
      knowledgeLines: parseKnowledgeLines(
        j.knowledgeLines,
        fallback.knowledgeLines ?? [],
      ),
    });
  } catch {
    return normalizeBriefingLines(fallback);
  }
}

function abandonedPromptNote(abandoned: number): string {
  const min = abandonedSessionMin();
  if (abandoned < min) return "";
  return `目前有 ${abandoned} 場開局尚未完賽（≥${min} 場），adviceLine 必須友善提醒先完賽或接續未打完的場次。`;
}

export async function generateFullDashboardBriefing(
  stats: Omit<RoleplayDashboardStats, "briefing" | "briefingStale">,
): Promise<RoleplayDashboardBriefing> {
  const payload = buildBriefingPayload(stats);
  const ruleFallback = buildRuleDashboardBriefing({ ...stats, briefing: null });
  const withAbandoned = appendAbandonedReminder(ruleFallback, payload.abandonedSessions);

  const memoryNote =
    payload.correctionMemoryLines.length > 0
      ? `\n【近五場須記數字｜記憶重點素材】（僅改寫進 knowledgeLines，保留【資訊對錯】標籤，須含金額／油耗等數字）\n${payload.correctionMemoryLines.map((x) => `- ${x}`).join("\n")}\n`
      : payload.factMemoryLines.length > 0
        ? `\n【近五場資訊對錯素材】（僅含金額／油耗等數字，改寫進 knowledgeLines）\n${payload.factMemoryLines.map((x) => `- ${x}`).join("\n")}\n`
        : "\n【近五場須記數字】無紀錄 → knowledgeLines 請回傳空陣列 []。\n";

  const strategyNote =
    payload.strategyAdviceFromCorrections !== "無"
      ? `\n【近五場銷售策略待加強】（描述性建議，請濃縮進 adviceLine，勿放入 knowledgeLines，≤${BRIEFING_ADVICE_LINE_MAX_CHARS}字）\n- ${payload.strategyAdviceFromCorrections}\n`
      : "\n【近五場銷售策略待加強】無 → adviceLine 可填維度練習方向或「無」。\n";

  const prompt = `你是汽車銷售對練教練。依下列戰績 JSON 產出「首頁小結」，繁體中文、口語精簡。
${BRIEFING_LLM_NUMERAL_RULE}
資料範圍：僅近 ${payload.last5Scores.length} 場完賽。
欄位：strengthLine（最強維度，≤${BRIEFING_DIM_LINE_MAX_CHARS}字，須完整句、句尾須有「。」）、weaknessLine（待加強維度，≤${BRIEFING_DIM_LINE_MAX_CHARS}字，須完整句、句尾須有「。」）。
trendLine：累計場次、整體均分與近 5 場分數序列（如 15→41→59），並一句話描述走勢；≤${BRIEFING_TREND_LINE_MAX_CHARS}字，須寫完整句、句尾須有「。」，勿以逗號結尾。
adviceLine：一語總結練習方向、銷售策略待加強或未完賽提醒，≤${BRIEFING_ADVICE_LINE_MAX_CHARS}字，須完整句、句尾須有「。」；策略類描述性建議放此欄，無特別建議填「無」。
knowledgeLines：僅彙整須記住的數字事實（金額、油耗、里程等）；每條以【資訊對錯】開頭；不得放銷售策略或行為建議；每條≤${BRIEFING_KNOWLEDGE_LINE_MAX_CHARS}字、須完整句；最多12條；無素材則 []。
${abandonedPromptNote(payload.abandonedSessions)}${memoryNote}${strategyNote}
僅回傳 JSON：{"strengthLine":"","weaknessLine":"","trendLine":"","adviceLine":"","knowledgeLines":["",""]}

戰績：
${JSON.stringify(payload)}`;

  try {
    const raw = await geminiGenerateText(prompt, {
      json: true,
      maxOutputTokens: 480,
      temperature: 0.3,
    });
    return parseBriefingJsonResponse(raw, withAbandoned);
  } catch {
    return normalizeBriefingLines(withAbandoned);
  }
}

export async function mergeDashboardBriefing(
  previous: RoleplayDashboardBriefing,
  stats: Omit<RoleplayDashboardStats, "briefing" | "briefingStale">,
  delta: BriefingActivityDelta,
): Promise<RoleplayDashboardBriefing> {
  const payload = buildBriefingPayload(stats);
  const ruleFallback = buildRuleDashboardBriefing({ ...stats, briefing: null });
  const withAbandoned = appendAbandonedReminder(ruleFallback, payload.abandonedSessions);

  const memoryNote =
    payload.correctionMemoryLines.length > 0
      ? `\n【近五場須記數字｜記憶重點】（僅改寫進 knowledgeLines）\n${payload.correctionMemoryLines.map((x) => `- ${x}`).join("\n")}\n`
      : payload.factMemoryLines.length > 0
        ? `\n【近五場資訊對錯】（僅數字事實）\n${payload.factMemoryLines.map((x) => `- ${x}`).join("\n")}\n`
        : "\n【近五場須記數字】無 → knowledgeLines 為 []。\n";

  const strategyNote =
    payload.strategyAdviceFromCorrections !== "無"
      ? `\n【近五場銷售策略待加強】（描述性建議，請濃縮進 adviceLine，勿放入 knowledgeLines）\n- ${payload.strategyAdviceFromCorrections}\n`
      : "\n【近五場銷售策略待加強】無。\n";

  const prompt = `你是汽車銷售對練教練。請在「先前首頁小結」基礎上，融入最新演練，產出更新版小結（繁體中文）。
${BRIEFING_LLM_NUMERAL_RULE}
資料範圍：近 ${payload.last5Scores.length} 場完賽。
adviceLine：練習方向、銷售策略待加強或未完賽提醒，≤${BRIEFING_ADVICE_LINE_MAX_CHARS}字，須完整句、句尾須有「。」；無則「無」。
trendLine：可含累計場次、均分與近 5 場分數序列，≤${BRIEFING_TREND_LINE_MAX_CHARS}字，須完整句、句尾須有「。」。
knowledgeLines：僅須記住的數字事實；每條以【資訊對錯】開頭；不得放銷售策略；每條≤${BRIEFING_KNOWLEDGE_LINE_MAX_CHARS}字、須完整句；最多12條；無則 []。
${abandonedPromptNote(payload.abandonedSessions)}${memoryNote}${strategyNote}

【先前小結】
${JSON.stringify(previous)}

【最新戰績摘要】
${JSON.stringify(payload)}

【本次變化】
${JSON.stringify(delta)}

規則：保留先前小結中仍成立的數字重點；分數走勢、強弱項、未完成提醒需反映最新數據；knowledgeLines 僅保留仍須記住的數字事實，策略描述一律放 adviceLine。
僅回傳 JSON：{"strengthLine":"","weaknessLine":"","trendLine":"","adviceLine":"","knowledgeLines":["",""]}`;

  try {
    const raw = await geminiGenerateText(prompt, {
      json: true,
      maxOutputTokens: 480,
      temperature: 0.35,
    });
    return parseBriefingJsonResponse(raw, withAbandoned);
  } catch {
    return normalizeBriefingLines(withAbandoned);
  }
}
