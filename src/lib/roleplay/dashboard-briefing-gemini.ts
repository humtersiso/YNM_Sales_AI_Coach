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
  };
}

function trimLine(s: unknown, fallback: string, max = 48): string {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  const out = t.length > max ? `${t.slice(0, max - 1)}…` : t;
  return out || fallback;
}

function parseKnowledgeLines(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback.slice(0, 3);
  const lines = raw
    .map((x) => trimLine(x, "", 120))
    .filter(Boolean);
  return lines.length > 0 ? lines.slice(0, 3) : fallback.slice(0, 3);
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

  const knowledgeNote =
    payload.knowledgeReminders.length > 0
      ? `\n【待記憶知識點】（來自近場對練弱項或佐證資料，請改寫成 2～3 條 knowledgeLines）\n${payload.knowledgeReminders.map((x) => `- ${x}`).join("\n")}\n`
      : "\n若事實引用（factCheck）為弱項，knowledgeLines 仍須列出 2 條具體數字／試算方式供記憶。\n";

  const prompt = `你是汽車銷售對練教練。依下列戰績 JSON 產出「首頁小結」四行，每行不超過 36 字、繁體中文、口語精簡、不加編號。
${BRIEFING_LLM_NUMERAL_RULE}
欄位：strengthLine（呼應最強維度）、weaknessLine（待加強）、trendLine（近 5 場分數走勢）、adviceLine（具體下一步，可含建議練習組合；勿塞入長串數字，數字放 knowledgeLines）。
knowledgeLines：2～3 條「記憶重點」，每條≤80字、須完整句子、勿用省略號截斷，須含具體數字或試算方式；優先呼應待記憶知識點與 factCheck 弱項。
${abandonedPromptNote(payload.abandonedSessions)}${knowledgeNote}
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

  const knowledgeNote =
    payload.knowledgeReminders.length > 0
      ? `\n【待記憶知識點】\n${payload.knowledgeReminders.map((x) => `- ${x}`).join("\n")}\n`
      : "";

  const prompt = `你是汽車銷售對練教練。請在「先前首頁小結」基礎上，融入最新演練變化，產出更新版四行小結（每行≤36字、繁體中文）。
${BRIEFING_LLM_NUMERAL_RULE}
knowledgeLines：2～3 條具體數字／事實記憶點（每條≤80字、完整句子、阿拉伯數字），優先保留仍易忘的知識點並加入本場新弱項。
${abandonedPromptNote(payload.abandonedSessions)}${knowledgeNote}

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
