import type { SessionUser } from "@/lib/auth/session";
import {
  generateCustomerFirstReply,
  generateCustomerOpening,
  generateCustomerReply,
} from "@/lib/roleplay/engine/customer-agent";
import {
  composeScenarioFromConfig,
  enrichDemoScenarioWithRag,
  parseSessionConfig,
  randomRoleplayConfig,
} from "@/lib/roleplay/engine/scenario-composer";
import { finalizeScoreResultForDisplay } from "@/lib/roleplay/roleplay-session-detail";
import {
  enrichScoreResult,
  scoreRoleplaySession,
} from "@/lib/roleplay/engine/scoring-agent";
import {
  createSessionId,
  getSession,
  saveSession,
} from "@/lib/roleplay/engine/session-store";
import {
  logRoleplayGate1Started,
  persistRoleplayGate2Completed,
} from "@/lib/bq/roleplay-sessions-bq";
import {
  getRoleplayScenario,
  resolvePersona,
} from "@/lib/roleplay/scenario-repository";
import type { RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";
import type { RoleplaySession } from "@/lib/roleplay/session-types";
import {
  getAgentDashboardStats,
  getAgentHistory,
  attachScoreHistory,
} from "@/lib/roleplay/stats-service";
import { refreshAgentDashboardBriefing } from "@/lib/roleplay/agent-dashboard-briefing-service";
import { isRoleplayAdminTestUser } from "@/lib/roleplay/roleplay-admin";
import { RoleplayRagCoverageError } from "@/lib/roleplay/rag-context";
import type { RoleplayRagCoverage } from "@/lib/roleplay/rag-context";

export class RoleplaySessionError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

function buildCoachMaterials(scenario: RoleplaySession["scenario"], ragCoverage?: RoleplayRagCoverage) {
  return {
    facts: scenario.sectionC.facts,
    keyPoints: scenario.sectionD.keyPoints,
    forbidden: scenario.sectionD.forbidden,
    sourceTitles: ragCoverage?.sourceTitles ?? [],
    strategyIds: ragCoverage?.strategyIds ?? [],
  };
}

async function createSessionFromScenario(input: {
  scenario: RoleplaySession["scenario"];
  config?: RoleplaySessionConfig;
  user: SessionUser;
  ragCoverage?: RoleplayRagCoverage;
}): Promise<{
  sessionId: string;
  customerMessage: string;
  maxTurns: number;
  turn: number;
  scenarioTitle: string;
  config: RoleplaySessionConfig | null;
  agentSpeaksFirst: boolean;
  coachMaterials: ReturnType<typeof buildCoachMaterials>;
  ragCoverage?: RoleplayRagCoverage;
}> {
  const personaId = input.config?.personaId ?? input.scenario.sectionE.personaId;
  const persona = resolvePersona(personaId);
  const isDemo = input.scenario.scenarioId.startsWith("KB-T33");
  const opening = await generateCustomerOpening(input.scenario, persona, {
    useLlm: false,
  });
  const now = new Date().toISOString();

  const session: RoleplaySession = {
    sessionId: createSessionId(),
    scenarioId: input.scenario.scenarioId,
    personaId: persona.id,
    scenario: input.scenario,
    config: input.config,
    userId: input.user.userId,
    username: input.user.username,
    displayName: input.user.displayName,
    branch: input.user.branch ?? "",
    turns: [],
    pendingCustomerOpening: opening,
    agentTurnCount: 0,
    maxTurns: input.scenario.sectionE.maxTurns,
    status: "active",
    startedAt: now,
    followUpIndex: 0,
    ragCoverage: input.ragCoverage,
  };

  saveSession(session);
  logRoleplayGate1Started(session);
  void refreshAgentDashboardBriefing(session.userId, {
    trigger: "gate1",
    sessionId: session.sessionId,
  }).catch((e) => {
    console.warn("[roleplay] dashboard briefing refresh (gate1) failed", e);
  });

  return {
    sessionId: session.sessionId,
    customerMessage: opening,
    maxTurns: session.maxTurns,
    turn: 0,
    scenarioTitle: session.scenario.sectionA.title,
    config: input.config ?? null,
    agentSpeaksFirst: true,
    coachMaterials: buildCoachMaterials(input.scenario, input.ragCoverage),
    ragCoverage: input.ragCoverage,
  };
}

/** 固定示範情境（相容舊流程） */
export async function startRoleplaySession(input: {
  scenarioId: string;
  personaId?: string;
  user: SessionUser;
}) {
  let scenario = getRoleplayScenario(input.scenarioId);
  if (!scenario) throw new RoleplaySessionError("找不到情境", 404);

  if (input.personaId) {
    scenario = { ...scenario, sectionE: { ...scenario.sectionE, personaId: input.personaId } };
  }

  const enriched = await enrichDemoScenarioWithRag(scenario);
  return createSessionFromScenario({
    scenario: enriched.scenario,
    user: input.user,
    ragCoverage: enriched.ragCoverage ?? undefined,
  });
}

/** 動態情境：用戶設定或隨機 */
export async function startRoleplaySessionWithConfig(input: {
  mode: "custom" | "random";
  config?: Partial<RoleplaySessionConfig>;
  user: SessionUser;
}) {
  let config: RoleplaySessionConfig;
  try {
    config =
      input.mode === "random"
        ? randomRoleplayConfig(input.config)
        : parseSessionConfig((input.config ?? {}) as Record<string, unknown>);
  } catch (e) {
    throw new RoleplaySessionError(
      e instanceof Error ? e.message : "設定無效",
      400,
    );
  }

  try {
    const { scenario, ragCoverage } = await composeScenarioFromConfig(config);
    return createSessionFromScenario({ scenario, config, user: input.user, ragCoverage });
  } catch (e) {
    if (e instanceof RoleplayRagCoverageError) {
      throw new RoleplaySessionError(e.message, 400);
    }
    throw e;
  }
}

function syncDialoguePhase(session: RoleplaySession): {
  awaitingAgentClosing: boolean;
  readyToScore: boolean;
} {
  if (session.agentClosingSent) {
    session.awaitingAgentClosing = false;
    return { awaitingAgentClosing: false, readyToScore: true };
  }
  if (session.agentTurnCount >= session.maxTurns) {
    session.awaitingAgentClosing = true;
    return { awaitingAgentClosing: true, readyToScore: false };
  }
  session.awaitingAgentClosing = false;
  return { awaitingAgentClosing: false, readyToScore: false };
}

export async function submitRoleplayTurn(input: {
  sessionId: string;
  message: string;
}): Promise<{
  customerMessage: string;
  turn: number;
  maxTurns: number;
  shouldFinish: boolean;
  awaitingAgentClosing?: boolean;
  readyToScore?: boolean;
}> {
  const session = getSession(input.sessionId);
  if (!session) throw new RoleplaySessionError("對練場次不存在或已過期", 404);
  if (session.status !== "active") {
    throw new RoleplaySessionError("此場次已結束", 400);
  }

  const text = input.message.trim();
  if (!text) throw new RoleplaySessionError("請輸入回覆內容");

  if (session.agentClosingSent) {
    throw new RoleplaySessionError("已送出收尾致謝，請點「結束評分」", 400);
  }

  syncDialoguePhase(session);
  saveSession(session);

  const now = new Date().toISOString();

  if (session.awaitingAgentClosing) {
    session.turns.push({ role: "agent", content: text, at: now });
    session.awaitingAgentClosing = false;
    session.agentClosingSent = true;
    saveSession(session);
    return {
      customerMessage: "",
      turn: session.agentTurnCount,
      maxTurns: session.maxTurns,
      shouldFinish: true,
      awaitingAgentClosing: false,
      readyToScore: true,
    };
  }

  // 舊版：開局曾把客戶開場寫在 turns[0]，改為業代先、再生成對應首句
  if (
    session.agentTurnCount === 0 &&
    session.turns.length === 1 &&
    session.turns[0]?.role === "customer"
  ) {
    const planned = session.turns[0]!.content;
    session.turns = [];
    session.pendingCustomerOpening = planned;
  }

  const isOpeningTurn =
    session.agentTurnCount === 0 && !!session.pendingCustomerOpening?.trim();

  if (isOpeningTurn) {
    session.turns.push({ role: "agent", content: text, at: now });
    const persona = resolvePersona(session.personaId);
    const customerReply = await generateCustomerFirstReply({
      scenario: session.scenario,
      persona,
      agentMessage: text,
      plannedOpening: session.pendingCustomerOpening!,
    });
    session.pendingCustomerOpening = undefined;
    session.turns.push({ role: "customer", content: customerReply, at: new Date().toISOString() });
    saveSession(session);
    return {
      customerMessage: customerReply,
      turn: 0,
      maxTurns: session.maxTurns,
      shouldFinish: false,
      awaitingAgentClosing: false,
      readyToScore: false,
    };
  }

  if (session.agentTurnCount >= session.maxTurns && !session.awaitingAgentClosing) {
    throw new RoleplaySessionError("已達對話輪次上限，請先收尾致謝", 400);
  }

  session.turns.push({ role: "agent", content: text, at: now });
  session.agentTurnCount += 1;

  const persona = resolvePersona(session.personaId);
  const customerReply = await generateCustomerReply({
    scenario: session.scenario,
    persona,
    turns: session.turns,
    agentMessage: text,
    followUpIndex: session.followUpIndex,
    agentTurnCount: session.agentTurnCount,
    maxTurns: session.maxTurns,
  });
  session.followUpIndex += 1;
  session.turns.push({ role: "customer", content: customerReply, at: new Date().toISOString() });
  const phase = syncDialoguePhase(session);
  saveSession(session);

  return {
    customerMessage: customerReply,
    turn: session.agentTurnCount,
    maxTurns: session.maxTurns,
    shouldFinish: phase.readyToScore,
    awaitingAgentClosing: phase.awaitingAgentClosing,
    readyToScore: phase.readyToScore,
  };
}

export async function finishRoleplaySession(sessionId: string): Promise<{
  scoreResult: RoleplaySession["scoreResult"];
  sessionId: string;
}> {
  const session = getSession(sessionId);
  if (!session) throw new RoleplaySessionError("對練場次不存在或已過期", 404);
  if (session.status === "finished" && session.scoreResult) {
    return { sessionId, scoreResult: finalizeScoreResultForDisplay(session.scoreResult) };
  }
  if (session.agentTurnCount < 1) {
    throw new RoleplaySessionError("請至少回覆一輪再結束評分", 400);
  }
  if (!session.agentClosingSent) {
    throw new RoleplaySessionError("請向客戶收尾致謝後再結束評分", 400);
  }

  // scoreRoleplaySession 內已含規則五維評分 + Rubric 修正點，勿再 enrich 以免重複計算
  const scoreResult = await attachScoreHistory(
    session.userId,
    await scoreRoleplaySession({
      scenario: session.scenario,
      turns: session.turns,
    }),
    session.sessionId,
  );

  session.status = "finished";
  session.finishedAt = new Date().toISOString();
  session.scoreResult = scoreResult;
  saveSession(session);

  const displayScore = finalizeScoreResultForDisplay(scoreResult);

  try {
    await persistRoleplayGate2Completed(session);
  } catch (e) {
    console.warn("[roleplay] Gate2 BQ persist failed", e);
    throw new RoleplaySessionError(
      "評分已完成，但寫入紀錄失敗，請稍後從首頁查看或聯絡管理員",
      500,
    );
  }

  // 首頁小結更新改背景執行，避免使用者等第二次 Gemini
  void refreshAgentDashboardBriefing(
    session.userId,
    { trigger: "gate2", sessionId: session.sessionId },
    session,
  ).catch((e) => {
    console.warn("[roleplay] dashboard briefing refresh (gate2) failed", e);
  });

  return { sessionId, scoreResult: displayScore };
}

export function getRoleplaySessionForUser(
  sessionId: string,
  userId?: string,
): RoleplaySession | null {
  const session = getSession(sessionId);
  if (!session) return null;
  if (userId && session.userId !== userId) return null;
  return session;
}

/** 演練頁還原進行中場次（避免 sessionStorage 被 Strict Mode 清掉） */
export async function getRoleplayPracticeBootstrap(sessionId: string, userId: string) {
  const session = getRoleplaySessionForUser(sessionId, userId);
  if (!session) return null;

  const phase =
    session.status === "active" ? syncDialoguePhase(session) : { awaitingAgentClosing: false, readyToScore: false };
  if (session.status === "active") saveSession(session);

  return {
    sessionId: session.sessionId,
    status: session.status,
    scenarioTitle: session.scenario.sectionA.title,
    maxTurns: session.maxTurns,
    turn: session.agentTurnCount,
    agentSpeaksFirst:
      session.agentTurnCount === 0 && !!session.pendingCustomerOpening?.trim(),
    awaitingAgentClosing: phase.awaitingAgentClosing,
    agentClosingSent: session.agentClosingSent ?? false,
    readyToScore: session.agentClosingSent ?? phase.readyToScore,
    plannedCustomerOpening:
      session.pendingCustomerOpening?.trim() ||
      session.scenario.sectionA.openingLine?.trim() ||
      "",
    messages: session.turns.map((t, i) => ({
      id: `${session.sessionId}-${i}`,
      role: t.role as "customer" | "agent",
      content: t.content,
    })),
    scoreResult: session.scoreResult
      ? session.status === "finished"
        ? finalizeScoreResultForDisplay(session.scoreResult)
        : await enrichScoreResult(session.scenario, session.turns, session.scoreResult)
      : null,
    coachMaterials: buildCoachMaterials(session.scenario, session.ragCoverage),
    ragCoverage: session.ragCoverage ?? null,
  };
}

export async function getRoleplayStatsForUser(user: SessionUser) {
  return getAgentDashboardStats(user.userId, {
    syncBackfillIfMissing: isRoleplayAdminTestUser(user),
  });
}

export async function getRoleplayHistoryForUser(userId: string, limit = 20) {
  return getAgentHistory(userId, limit);
}
