import { getAgentDashboardRow, upsertAgentDashboardRow } from "@/lib/bq/roleplay-agent-dashboard-bq";
import { appendAbandonedReminder } from "@/lib/roleplay/dashboard-briefing";
import { dashboardStatsFingerprint } from "@/lib/roleplay/dashboard-briefing-cache";
import {
  generateFullDashboardBriefing,
  mergeDashboardBriefing,
  type BriefingActivityDelta,
} from "@/lib/roleplay/dashboard-briefing-gemini";
import type { RoleplayDashboardStats } from "@/lib/roleplay/roleplay-types-api";
import {
  buildAgentDashboardStatsContext,
  type AgentDashboardStatsContext,
} from "@/lib/roleplay/stats-service";
import type { RoleplaySession } from "@/lib/roleplay/session-types";

export type RefreshBriefingTrigger = {
  trigger: "gate1" | "gate2";
  sessionId: string;
};

function buildGate2ActivityDelta(
  ctx: AgentDashboardStatsContext,
  sessionId: string,
): BriefingActivityDelta {
  const session = ctx.justFinished;
  if (session?.scoreResult) {
    return {
      trigger: "gate2",
      sessionId,
      score: session.scoreResult.score,
      grade: session.scoreResult.grade,
      dimensionScores: session.scoreResult.dimensions.map((d) => ({
        id: d.dimensionId,
        label: d.label,
        score: d.score,
      })),
      improvementTips: session.scoreResult.improvementTips,
      scenarioFacts: session.scenario.sectionC.facts.map((f) => ({
        label: f.label,
        value: f.value,
      })),
    };
  }
  return { trigger: "gate2", sessionId };
}

/**
 * Gate1（背景）：不呼叫 Gemini。同步指紋，並以規則更新 adviceLine 未完賽提醒。
 */
async function refreshAgentDashboardBriefingGate1(
  userId: string,
  sessionId: string,
): Promise<void> {
  const ctx = await buildAgentDashboardStatsContext(userId, {
    lastStartedSessionId: sessionId,
  });

  const startedSessions = Math.max(ctx.core.startedSessions, 1);
  const core = { ...ctx.core, startedSessions };
  const fingerprint = dashboardStatsFingerprint({
    ...core,
    lastStartedSessionId: sessionId,
  });

  const existing = await getAgentDashboardRow(userId);
  if (!existing?.briefing) return;

  const abandoned = Math.max(0, startedSessions - core.completedSessions);
  const briefing = appendAbandonedReminder(existing.briefing, abandoned);

  await upsertAgentDashboardRow({
    agentId: userId,
    briefing,
    statsFingerprint: fingerprint,
    lastTrigger: "gate1",
    lastSessionId: sessionId,
  });
}

/**
 * Gate1：規則輕量更新；Gate2（await）：Gemini 產生或融合小結，寫入 roleplay_agent_dashboard。
 */
export async function refreshAgentDashboardBriefing(
  userId: string,
  input: RefreshBriefingTrigger,
  justFinished?: RoleplaySession,
): Promise<void> {
  if (input.trigger === "gate1") {
    await refreshAgentDashboardBriefingGate1(userId, input.sessionId);
    return;
  }

  const ctx = await buildAgentDashboardStatsContext(userId, {
    justFinished,
  });

  const core = ctx.core;
  const fingerprint = dashboardStatsFingerprint({
    ...core,
    lastStartedSessionId: ctx.lastStartedSessionId,
  });

  const existing = await getAgentDashboardRow(userId);
  const statsForLlm: Omit<RoleplayDashboardStats, "briefing" | "briefingStale"> = {
    ...core,
  };

  let briefing;
  if (existing?.briefing && core.completedSessions > 0) {
    briefing = await mergeDashboardBriefing(
      existing.briefing,
      statsForLlm,
      buildGate2ActivityDelta({ ...ctx, justFinished }, input.sessionId),
    );
  } else {
    briefing = await generateFullDashboardBriefing(statsForLlm);
  }

  await upsertAgentDashboardRow({
    agentId: userId,
    briefing,
    statsFingerprint: fingerprint,
    lastTrigger: "gate2",
    lastSessionId: input.sessionId,
  });
}

/** 已有完賽但 BQ 無小結列時補寫（例如表曾不存在） */
export async function backfillAgentDashboardBriefingIfMissing(userId: string): Promise<void> {
  const existing = await getAgentDashboardRow(userId);
  if (existing?.briefing) return;

  const ctx = await buildAgentDashboardStatsContext(userId);
  if (ctx.core.completedSessions === 0) return;

  const lastSession =
    ctx.core.scoreTrend[ctx.core.scoreTrend.length - 1]?.sessionId ??
    ctx.lastStartedSessionId ??
    "";

  await refreshAgentDashboardBriefing(userId, {
    trigger: "gate2",
    sessionId: lastSession || "backfill",
  });
}
