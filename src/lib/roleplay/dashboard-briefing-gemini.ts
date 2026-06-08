import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import {
  abandonedSessionMin,
} from "@/lib/roleplay/dashboard-briefing-cache";
import {
  buildRuleDashboardBriefing,
  appendAbandonedReminder,
} from "@/lib/roleplay/dashboard-briefing";
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
    factMemoryLines: stats.factMemoryLines ?? [],
    strategyAdviceFromCorrections: stats.strategyAdviceFromCorrections ?? "無",
  };
}

function trimLine(s: unknown, fallback: string, max = 48): string {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  const out = t.length > max ? `${t.slice(0, max - 1)}…` : t;
  return out || fallback;
}

function parseKnowledgeLines(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback.slice(0, 3);
  const lines = raw.map((x) => trimLine(x, "", 120)).filter(Boolean);
  if (lines.length > 0) return lines.slice(0, 3);
  return fallback.length > 0 ? fallback.slice(0, 3) : [];
}

function parseBriefingJsonResponse(
  raw: string | null,
  fallback: RoleplayDashboardBriefing,
): RoleplayDashboardBriefing {
  if (!raw) return normalizeBriefingLines(fallback);
  try {
    const j = JSON.parse(raw) as Partial<RoleplayDashboardBriefing>;
    return normalizeBriefingLines({
      strengthLine: trimLine(j.strengthLine, fallback.strengthLine),
      weaknessLine: trimLine(j.weaknessLine, fallback.weaknessLine),
      trendLine: trimLine(j.trendLine, fallback.trendLine),
      adviceLine: trimLine(j.adviceLine, fallback.adviceLine),
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

  const factNote =
    payload.factMemoryLines.length > 0
      ? `\n【近五場資訊對錯｜記憶重點素材】（請改寫進 knowledgeLines，保留阿拉伯數字，像考試必背）\n${payload.factMemoryLines.map((x) => `- ${x}`).join("\n")}\n`
      : "\n【近五場資訊對錯】無待加強紀錄 → knowledgeLines 請回傳空陣列 []。\n";

  const strategyNote =
    payload.strategyAdviceFromCorrections !== "無"
      ? `\n【近五場銷售策略待加強】（請濃縮進 adviceLine，≤36字）\n- ${payload.strategyAdviceFromCorrections}\n`
      : "\n【近五場銷售策略】無待加強 → adviceLine 請填「無」。\n";

  const prompt = `你是汽車銷售對練教練。依下列戰績 JSON 產出「首頁小結」，繁體中文、口語精簡。
${BRIEFING_LLM_NUMERAL_RULE}
資料範圍：僅近 ${payload.last5Scores.length} 場完賽。
欄位：strengthLine（最強維度，≤36字）、weaknessLine（待加強維度，≤36字）、trendLine（近場分數走勢，≤36字）。
adviceLine：僅總結「銷售策略」待加強（如邀約試乘、提供試算表）；素材見下方；無則填「無」，勿硬編。
knowledgeLines：僅總結「資訊對錯」待加強（須牢記的數字，像考試）；每條≤80字、含阿拉伯數字；無則回傳 []，勿硬編。
${abandonedPromptNote(payload.abandonedSessions)}${factNote}${strategyNote}
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

  const factNote =
    payload.factMemoryLines.length > 0
      ? `\n【近五場資訊對錯｜記憶重點】\n${payload.factMemoryLines.map((x) => `- ${x}`).join("\n")}\n`
      : "\n【資訊對錯】無 → knowledgeLines 為 []。\n";

  const strategyNote =
    payload.strategyAdviceFromCorrections !== "無"
      ? `\n【近五場銷售策略】\n- ${payload.strategyAdviceFromCorrections}\n`
      : "\n【銷售策略】無 → adviceLine 為「無」。\n";

  const prompt = `你是汽車銷售對練教練。請在「先前首頁小結」基礎上，融入最新演練，產出更新版小結（繁體中文）。
${BRIEFING_LLM_NUMERAL_RULE}
資料範圍：近 ${payload.last5Scores.length} 場完賽。
adviceLine：僅銷售策略總結，≤36字；無則「無」。
knowledgeLines：僅資訊對錯數字記憶，每條≤80字；無則 []。
${abandonedPromptNote(payload.abandonedSessions)}${factNote}${strategyNote}

【先前小結】
${JSON.stringify(previous)}

【最新戰績摘要】
${JSON.stringify(payload)}

【本次變化】
${JSON.stringify(delta)}

規則：保留先前小結中仍成立的重點；分數走勢、強弱項、未完成提醒需反映最新數據；knowledgeLines 可保留舊條目並替換已掌握的。
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
