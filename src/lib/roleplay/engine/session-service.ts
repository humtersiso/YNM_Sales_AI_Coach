import type { SessionUser } from "@/lib/auth/session";
import {
  generateCustomerOpening,
  generateCustomerReply,
} from "@/lib/roleplay/engine/customer-agent";
import { scoreRoleplaySession } from "@/lib/roleplay/engine/scoring-agent";
import {
  createSessionId,
  getSession,
  saveSession,
} from "@/lib/roleplay/engine/session-store";
import {
  getRoleplayScenario,
  resolvePersona,
} from "@/lib/roleplay/scenario-repository";
import type { RoleplaySession } from "@/lib/roleplay/session-types";

export class RoleplaySessionError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

export async function startRoleplaySession(input: {
  scenarioId: string;
  personaId?: string;
  user: SessionUser;
}): Promise<{
  sessionId: string;
  customerMessage: string;
  maxTurns: number;
  turn: number;
  scenarioTitle: string;
}> {
  const scenario = getRoleplayScenario(input.scenarioId);
  if (!scenario) throw new RoleplaySessionError("找不到情境", 404);

  const personaId = input.personaId ?? scenario.sectionE.personaId;
  const persona = resolvePersona(personaId);
  const opening = await generateCustomerOpening(scenario, persona);
  const now = new Date().toISOString();

  const session: RoleplaySession = {
    sessionId: createSessionId(),
    scenarioId: scenario.scenarioId,
    personaId: persona.id,
    scenario,
    userId: input.user.userId,
    username: input.user.username,
    displayName: input.user.displayName,
    branch: input.user.branch ?? "",
    turns: [{ role: "customer", content: opening, at: now }],
    agentTurnCount: 0,
    maxTurns: scenario.sectionE.maxTurns,
    status: "active",
    startedAt: now,
    followUpIndex: 0,
  };

  saveSession(session);

  return {
    sessionId: session.sessionId,
    customerMessage: opening,
    maxTurns: session.maxTurns,
    turn: 0,
    scenarioTitle: scenario.sectionA.title,
  };
}

export async function submitRoleplayTurn(input: {
  sessionId: string;
  message: string;
}): Promise<{
  customerMessage: string;
  turn: number;
  maxTurns: number;
  shouldFinish: boolean;
}> {
  const session = getSession(input.sessionId);
  if (!session) throw new RoleplaySessionError("對練場次不存在或已過期", 404);
  if (session.status !== "active") {
    throw new RoleplaySessionError("此場次已結束", 400);
  }

  const text = input.message.trim();
  if (!text) throw new RoleplaySessionError("請輸入回覆內容");

  if (session.agentTurnCount >= session.maxTurns) {
    throw new RoleplaySessionError("已達最大輪次，請結束並評分", 400);
  }

  const now = new Date().toISOString();
  session.turns.push({ role: "agent", content: text, at: now });
  session.agentTurnCount += 1;

  const persona = resolvePersona(session.personaId);
  const customerReply = await generateCustomerReply({
    scenario: session.scenario,
    persona,
    turns: session.turns,
    agentMessage: text,
    followUpIndex: session.followUpIndex,
  });
  session.followUpIndex += 1;
  session.turns.push({ role: "customer", content: customerReply, at: new Date().toISOString() });
  saveSession(session);

  const shouldFinish = session.agentTurnCount >= session.maxTurns;

  return {
    customerMessage: customerReply,
    turn: session.agentTurnCount,
    maxTurns: session.maxTurns,
    shouldFinish,
  };
}

export async function finishRoleplaySession(sessionId: string): Promise<{
  scoreResult: RoleplaySession["scoreResult"];
  sessionId: string;
}> {
  const session = getSession(sessionId);
  if (!session) throw new RoleplaySessionError("對練場次不存在或已過期", 404);
  if (session.status === "finished" && session.scoreResult) {
    return { sessionId, scoreResult: session.scoreResult };
  }
  if (session.agentTurnCount < 1) {
    throw new RoleplaySessionError("請至少回覆一輪再結束評分", 400);
  }

  const scoreResult = await scoreRoleplaySession({
    scenario: session.scenario,
    turns: session.turns,
  });

  session.status = "finished";
  session.finishedAt = new Date().toISOString();
  session.scoreResult = scoreResult;
  saveSession(session);

  return { sessionId, scoreResult };
}

export function getRoleplaySessionForUser(sessionId: string): RoleplaySession | null {
  return getSession(sessionId);
}
