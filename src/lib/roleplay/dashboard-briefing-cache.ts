import type { RoleplayDashboardBriefing, RoleplayDashboardStats } from "@/lib/roleplay/roleplay-types-api";
import { normalizeBriefingLines } from "@/lib/roleplay/briefing-numeral-format";

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
      ? j.knowledgeLines.map((x) => String(x ?? "").trim()).filter(Boolean)
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
