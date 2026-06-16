import { isValidCorrectionMemoryLine } from "@/lib/roleplay/briefing-correction-summary";
import type { RoleplayDashboardBriefing, RoleplayDashboardStats } from "@/lib/roleplay/roleplay-types-api";
import { normalizeBriefingLines } from "@/lib/roleplay/briefing-numeral-format";

/** 五維強弱單行上限（做得好的／待加強的） */
export const BRIEFING_DIM_LINE_MAX_CHARS = 120;
/** 進步趨勢可含累計場次、均分與近 5 場分數序列 */
export const BRIEFING_TREND_LINE_MAX_CHARS = 120;
/** 建議／未完賽提醒 */
export const BRIEFING_ADVICE_LINE_MAX_CHARS = 120;
export const BRIEFING_KNOWLEDGE_LINE_MAX_CHARS = 120;

function endsWithCompleteSentence(text: string): boolean {
  return /[。！？.!?]$/.test(text.trim());
}

function lastSentencePause(text: string): number {
  return Math.max(text.lastIndexOf("。"), text.lastIndexOf("！"), text.lastIndexOf("？"));
}

function isIncompleteBriefingLine(text: string): boolean {
  const t = text.trim();
  if (t.length < 6) return true;
  if (endsWithCompleteSentence(t)) return false;
  if (/…$/.test(t)) return true;
  if (/[，,、；;]$/.test(t)) return true;
  if (/[，,](雖|但|若|與|且|或|為|並|而|及)$/.test(t)) return true;
  if (/(雖|但|若|與|為|並|且|而|或|及)$/.test(t)) return true;
  return false;
}

/** 小結單行裁切：僅在句號／問號／驚嘆號處截斷，避免逗號半句 */
export function trimBriefingLine(text: unknown, fallback: string, maxChars: number): string {
  const t = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return fallback;

  const resolveWithinLimit = (s: string): string => {
    if (/^無$/.test(s)) return s;
    if (endsWithCompleteSentence(s)) return s;
    const pause = lastSentencePause(s);
    if (pause >= 12) return s.slice(0, pause + 1).trim();
    return fallback;
  };

  if (t.length <= maxChars) return resolveWithinLimit(t);

  const cut = t.slice(0, maxChars);
  const pause = lastSentencePause(cut);
  const minPause = Math.max(24, Math.floor(maxChars * 0.45));
  if (pause >= minPause) return cut.slice(0, pause + 1).trim();

  const firstPause = t.search(/[。！？]/);
  if (firstPause >= 12 && firstPause < maxChars) return t.slice(0, firstPause + 1).trim();

  const trimmed = `${cut.trim()}…`;
  return isIncompleteBriefingLine(trimmed) ? fallback || trimmed : trimmed;
}

export type DashboardFingerprintInput = {
  completedSessions: number;
  startedSessions: number;
  overallAvg: number;
  lastScore: number | null;
  scoreTrend: RoleplayDashboardStats["scoreTrend"];
  lastStartedSessionId?: string;
};

/** 戰績快照指紋（含未完成場次與最近開局/完賽 session） */
export function dashboardStatsFingerprint(input: DashboardFingerprintInput): string {
  const abandoned = Math.max(0, input.startedSessions - input.completedSessions);
  const lastCompleted = input.scoreTrend[input.scoreTrend.length - 1];
  return [
    input.completedSessions,
    input.startedSessions,
    abandoned,
    lastCompleted?.sessionId ?? "",
    lastCompleted?.score ?? "",
    input.lastStartedSessionId ?? "",
    input.overallAvg,
    input.lastScore ?? "",
  ].join("|");
}

export function parseBriefingJson(raw: string | null | undefined): RoleplayDashboardBriefing | null {
  if (!raw?.trim()) return null;
  try {
    const j = JSON.parse(raw) as Partial<RoleplayDashboardBriefing>;
    const strengthLine = String(j.strengthLine ?? "").trim();
    const weaknessLine = String(j.weaknessLine ?? "").trim();
    const trendLine = String(j.trendLine ?? "").trim();
    const adviceLine = String(j.adviceLine ?? "").trim();
    if (!strengthLine || !weaknessLine || !trendLine || !adviceLine) return null;
    const knowledgeLines = Array.isArray(j.knowledgeLines)
      ? j.knowledgeLines
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
          .filter((line) => isValidCorrectionMemoryLine(line))
      : [];
    return normalizeBriefingLines({
      strengthLine,
      weaknessLine,
      trendLine,
      adviceLine,
      knowledgeLines,
    });
  } catch {
    return null;
  }
}

export function abandonedSessionMin(): number {
  const n = Number(process.env.ROLEPLAY_BRIEFING_ABANDONED_MIN ?? "3");
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 3;
}
