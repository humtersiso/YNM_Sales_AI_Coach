import {
  countUserRoleplaySessions,
  listCompletedSessionsDetail,
  listRoleplaySessionsByUser,
  listUserSessionsForHistory,
  type RoleplayCompletedDetail,
} from "@/lib/bq/roleplay-sessions-bq";
import { getAgentDashboardRow } from "@/lib/bq/roleplay-agent-dashboard-bq";
import { backfillAgentDashboardBriefingIfMissing } from "@/lib/roleplay/agent-dashboard-briefing-service";
import {
  appendAbandonedReminder,
  buildRuleDashboardBriefing,
} from "@/lib/roleplay/dashboard-briefing";
import {
  buildCorrectionMemoryLinesFromCorrections,
  buildFactMemoryLinesFromCorrections,
  buildStrategyAdviceFromCorrections,
  takeRecentCompletedSessions,
} from "@/lib/roleplay/briefing-correction-summary";
import { buildKnowledgeRemindersFromSessions } from "@/lib/roleplay/briefing-knowledge-reminders";
import { dashboardStatsFingerprint } from "@/lib/roleplay/dashboard-briefing-cache";
import type { RoleplayDrillDifficulty } from "@/lib/roleplay/scenario-contract";
import type {
  RoleplayDashboardBriefing,
  RoleplayDashboardStats,
  RoleplayHistoryItem,
} from "@/lib/roleplay/roleplay-types-api";
import { historyItemFromCompletedDetailSync } from "@/lib/roleplay/roleplay-session-detail";
import { listArchivedSessionsForUser } from "@/lib/roleplay/engine/session-store";
import { ROLEPLAY_COMPETITORS_XTRAIL, ROLEPLAY_DIFFICULTIES } from "@/lib/roleplay/catalog";
import { ROLEPLAY_PERSONA_IDS, ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";
import type { RoleplayScoreResult, RoleplaySession } from "@/lib/roleplay/session-types";

const DIMENSION_IDS = ["empathy", "structure", "factCheck", "strategy", "advance"] as const;

/** 個人首頁雷達圖與「均分」須同一批完賽場次，加總才會一致 */
export const OVERVIEW_RADAR_LAST_N = 10;

const DIMENSION_SCORE_KEYS = [
  "scoreEmpathy",
  "scoreStructure",
  "scoreFactCheck",
  "scoreStrategy",
  "scoreClosing",
] as const satisfies readonly (keyof RoleplayCompletedDetail)[];

function hasFullDimensionScores(row: RoleplayCompletedDetail): boolean {
  return DIMENSION_SCORE_KEYS.every(
    (k) => row[k] != null && Number.isFinite(row[k] as number),
  );
}

const DIMENSION_LABELS: Record<string, string> = {
  empathy: "同理承接",
  structure: "論點完整度",
  factCheck: "事實引用正確",
  strategy: "策略使用",
  advance: "推進成交",
};

export type AgentDashboardStatsContext = {
  core: Omit<RoleplayDashboardStats, "briefing" | "briefingStale">;
  lastStartedSessionId?: string;
  justFinished?: RoleplaySession;
};

function normalizeDifficulty(d: string): RoleplayDrillDifficulty {
  if (d === "beginner" || d === "easy") return "beginner";
  if (d === "challenge" || d === "hard") return "challenge";
  return "advanced";
}

async function loadCompletedDetails(userId: string, limit = 50): Promise<RoleplayCompletedDetail[]> {
  const fromBq = await listCompletedSessionsDetail(userId, limit);
  if (fromBq.length > 0) return fromBq;
  const archived = listArchivedSessionsForUser(userId);
  return archived.map((r) => ({
    ...r,
    scoreEmpathy: null,
    scoreStructure: null,
    scoreFactCheck: null,
    scoreStrategy: null,
    scoreClosing: null,
    summary: "",
    improvementTips: [],
    correctionPoints: [],
    unusedStrategies: [],
    reportJson: null,
  }));
}

function sessionToCompletedDetail(session: RoleplaySession): RoleplayCompletedDetail | null {
  if (!session.scoreResult || !session.finishedAt) return null;
  const dims = session.scoreResult.dimensions;
  const find = (id: string) => dims.find((d) => d.dimensionId === id)?.score ?? null;
  return {
    sessionId: session.sessionId,
    status: "COMPLETED",
    userId: session.userId,
    username: session.username,
    branch: session.branch,
    personaId: session.personaId,
    competitor: session.scenario.sectionA.competitor,
    productLine: session.scenario.sectionA.productLine,
    targetModel: session.scenario.sectionA.productDisplayName,
    ageRange: session.scenario.sectionE.ageRange ?? "",
    difficulty: session.scenario.sectionE.difficulty,
    score: session.scoreResult.score,
    grade: session.scoreResult.grade,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    scoreEmpathy: find("empathy"),
    scoreStructure: find("structure"),
    scoreFactCheck: find("factCheck"),
    scoreStrategy: find("strategy"),
    scoreClosing: find("advance"),
    summary: session.scoreResult.summary,
    improvementTips: session.scoreResult.improvementTips,
    correctionPoints: session.scoreResult.correctionPoints ?? [],
    unusedStrategies: session.scoreResult.unusedStrategies,
    scenarioFacts: session.scenario.sectionC.facts.map((f) => ({
      label: f.label,
      value: f.value,
    })),
    factCheckComment:
      session.scoreResult.dimensions.find((d) => d.dimensionId === "factCheck")?.comment ?? "",
    reportJson: null,
  };
}

export function mergeJustFinished(
  completed: RoleplayCompletedDetail[],
  session?: RoleplaySession,
): RoleplayCompletedDetail[] {
  if (!session) return completed;
  const row = sessionToCompletedDetail(session);
  if (!row) return completed;
  const rest = completed.filter((c) => c.sessionId !== session.sessionId);
  return [row, ...rest];
}

function roundOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

function avgDimension(
  rows: RoleplayCompletedDetail[],
  key: (typeof DIMENSION_SCORE_KEYS)[number],
): number | null {
  if (rows.length === 0) return null;
  const vals = rows.map((r) => r[key] as number);
  return roundOneDecimal(vals.reduce((s, v) => s + v, 0) / vals.length);
}

function buildDimensionAverages(rows: RoleplayCompletedDetail[]): RoleplayDashboardStats["dimensionAverages"] {
  const cohort = rows.filter(hasFullDimensionScores);
  if (cohort.length === 0) return null;
  return {
    empathy: avgDimension(cohort, "scoreEmpathy"),
    structure: avgDimension(cohort, "scoreStructure"),
    factCheck: avgDimension(cohort, "scoreFactCheck"),
    strategy: avgDimension(cohort, "scoreStrategy"),
    advance: avgDimension(cohort, "scoreClosing"),
  };
}

/** 首頁均分＝五維顯示值加總（避免各維四捨五入後與場均分差 0.1） */
export function radarOverallFromDimensionAverages(
  avg: NonNullable<RoleplayDashboardStats["dimensionAverages"]>,
): number {
  return roundOneDecimal(DIMENSION_IDS.reduce((s, id) => s + (avg[id] ?? 0), 0));
}

function rankDimensions(
  avg: RoleplayDashboardStats["dimensionAverages"],
  take: "high" | "low",
): string[] {
  if (!avg) return [];
  const entries = DIMENSION_IDS.map((id) => ({
    id,
    score: avg[id] ?? -1,
  })).filter((e) => e.score >= 0);
  entries.sort((a, b) => (take === "high" ? b.score - a.score : a.score - b.score));
  return entries.slice(0, 2).map((e) => e.id);
}

function buildSuggestionsFromDetails(records: RoleplayCompletedDetail[]) {
  const counts = new Map<string, number>();
  for (const p of ROLEPLAY_PERSONA_IDS) {
    for (const d of ROLEPLAY_DIFFICULTIES) {
      for (const c of ROLEPLAY_COMPETITORS_XTRAIL) {
        counts.set(`${p}|${d.id}|${c}`, 0);
      }
    }
  }
  for (const r of records) {
    const key = `${r.personaId}|${normalizeDifficulty(r.difficulty)}|${r.competitor}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => a[1] - b[1]);
  const out: RoleplayDashboardStats["suggestions"] = [];
  for (const [key, count] of sorted.slice(0, 3)) {
    const [personaId, difficulty, competitor] = key.split("|") as [
      string,
      RoleplayDrillDifficulty,
      string,
    ];
    const diffLabel = ROLEPLAY_DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? difficulty;
    out.push({
      personaId,
      difficulty,
      competitor,
      label: `${diffLabel} · ${competitor}`,
      reason: count === 0 ? "尚未練習過此組合" : `僅練習 ${count} 次，建議加強`,
    });
  }
  return out;
}

export function buildDashboardStatsCore(
  completed: RoleplayCompletedDetail[],
  startedSessions: number,
): Omit<RoleplayDashboardStats, "briefing" | "briefingStale"> {
  const recent5 = takeRecentCompletedSessions(completed);
  const recentForRadar = takeRecentCompletedSessions(completed, OVERVIEW_RADAR_LAST_N);
  const trendSource = [...recent5]
    .sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)));

  const byDifficulty = ROLEPLAY_DIFFICULTIES.map((d) => {
    const subset = completed.filter((r) => normalizeDifficulty(r.difficulty) === d.id);
    const avg =
      subset.length > 0
        ? Math.round(subset.reduce((s, r) => s + r.score, 0) / subset.length)
        : 0;
    return { difficulty: d.id, label: d.label, avgScore: avg, count: subset.length };
  });

  const overallAvg =
    completed.length > 0
      ? Math.round(completed.reduce((s, r) => s + r.score, 0) / completed.length)
      : 0;

  const dimensionAverages = buildDimensionAverages(recentForRadar);
  const radarOverallAvg = dimensionAverages
    ? radarOverallFromDimensionAverages(dimensionAverages)
    : overallAvg;
  const completedSessions = completed.length;
  const correctionMemoryLines = buildCorrectionMemoryLinesFromCorrections(completed);
  const factMemoryLines = buildFactMemoryLinesFromCorrections(completed);
  const strategyAdviceFromCorrections = buildStrategyAdviceFromCorrections(completed);

  return {
    startedSessions,
    completedSessions,
    totalSessions: completedSessions,
    overallAvg,
    /** 與首頁雷達同一批近 N 場的均分，五維加總應與此一致 */
    radarOverallAvg,
    lastScore: completed[0]?.score ?? null,
    byDifficulty,
    dimensionAverages,
    strongestDimensions: rankDimensions(dimensionAverages, "high"),
    weakestDimensions: rankDimensions(dimensionAverages, "low"),
    dimensionLabels: DIMENSION_LABELS,
    scoreTrend: trendSource.map((r) => ({
      sessionId: r.sessionId,
      completedAt: r.finishedAt,
      score: r.score,
    })),
    suggestions: buildSuggestionsFromDetails(completed),
    knowledgeReminders: buildKnowledgeRemindersFromSessions(recent5),
    correctionMemoryLines,
    factMemoryLines,
    strategyAdviceFromCorrections,
  };
}

async function resolveLastStartedSessionId(userId: string): Promise<string | undefined> {
  const rows = await listUserSessionsForHistory(userId, 10);
  const started = rows.find((r) => r.status === "STARTED");
  return started?.sessionId;
}

export async function buildAgentDashboardStatsContext(
  userId: string,
  opts?: {
    justFinished?: RoleplaySession;
    lastStartedSessionId?: string;
  },
): Promise<AgentDashboardStatsContext> {
  const [completedRaw, sessionCounts] = await Promise.all([
    loadCompletedDetails(userId, 50),
    countUserRoleplaySessions(userId),
  ]);
  const completed = mergeJustFinished(completedRaw, opts?.justFinished);
  const lastStartedSessionId =
    opts?.lastStartedSessionId ?? (await resolveLastStartedSessionId(userId));

  const core = buildDashboardStatsCore(
    completed,
    Math.max(sessionCounts.started, completed.length),
  );

  return {
    core,
    lastStartedSessionId,
    justFinished: opts?.justFinished,
  };
}

function resolveBriefingFromAgentDashboard(
  core: Omit<RoleplayDashboardStats, "briefing" | "briefingStale">,
  lastStartedSessionId: string | undefined,
  row: Awaited<ReturnType<typeof getAgentDashboardRow>>,
): { briefing: RoleplayDashboardBriefing | null; briefingStale: boolean } {
  if (!row) {
    return { briefing: null, briefingStale: false };
  }

  const currentFp = dashboardStatsFingerprint({
    ...core,
    lastStartedSessionId,
  });
  const stale = row.statsFingerprint !== currentFp;

  return {
    briefing: row.briefing,
    briefingStale: stale,
  };
}

export async function getAgentDashboardStats(
  userId: string,
  opts?: { syncBackfillIfMissing?: boolean },
): Promise<RoleplayDashboardStats> {
  const ctx = await buildAgentDashboardStatsContext(userId);
  let row = await getAgentDashboardRow(userId);

  const needsBackfill = !row?.briefing && ctx.core.completedSessions > 0;

  if (needsBackfill) {
    if (opts?.syncBackfillIfMissing) {
      try {
        await backfillAgentDashboardBriefingIfMissing(userId);
        row = await getAgentDashboardRow(userId);
      } catch (e) {
        console.warn("[roleplay] briefing sync backfill failed", e);
      }
    } else {
      void backfillAgentDashboardBriefingIfMissing(userId).catch((e) => {
        console.warn("[roleplay] briefing backfill failed", e);
      });
    }
  }

  let { briefing, briefingStale } = resolveBriefingFromAgentDashboard(
    ctx.core,
    ctx.lastStartedSessionId,
    row,
  );

  if (!briefing && ctx.core.completedSessions > 0) {
    briefing = buildRuleDashboardBriefing({
      ...ctx.core,
      briefing: null,
      briefingStale: false,
    });
    briefingStale = !row?.briefing;
  }

  if (briefing) {
    const abandoned = Math.max(0, ctx.core.startedSessions - ctx.core.completedSessions);
    briefing = appendAbandonedReminder(briefing, abandoned);
    if (briefing.knowledgeLines.length === 0) {
      const memory =
        (ctx.core.correctionMemoryLines?.length ?? 0) > 0
          ? ctx.core.correctionMemoryLines!
          : (ctx.core.factMemoryLines?.length ?? 0) > 0
            ? ctx.core.factMemoryLines!
            : null;
      if (memory) {
        briefing = { ...briefing, knowledgeLines: memory };
      }
    }
  }

  return {
    ...ctx.core,
    briefing,
    briefingStale,
  };
}

/** @deprecated 使用 getAgentDashboardStats */
export async function getAgentStats(userId: string) {
  return getAgentDashboardStats(userId);
}

export async function getAgentHistory(userId: string, limit = 20): Promise<RoleplayHistoryItem[]> {
  const details = await listUserSessionsForHistory(userId, limit);
  return details.map((d) => historyItemFromCompletedDetailSync(d));
}

export async function attachScoreHistory(
  userId: string,
  scoreResult: RoleplayScoreResult,
  excludeSessionId?: string,
): Promise<RoleplayScoreResult> {
  const records = await listRoleplaySessionsByUser(userId, 15);
  const prior = records.find((r) => !excludeSessionId || r.sessionId !== excludeSessionId);
  if (prior == null || !Number.isFinite(prior.score)) {
    return { ...scoreResult, previousScore: null, scoreDelta: null };
  }
  const previous = prior.score;
  return {
    ...scoreResult,
    previousScore: previous,
    scoreDelta: scoreResult.score - previous,
  };
}
