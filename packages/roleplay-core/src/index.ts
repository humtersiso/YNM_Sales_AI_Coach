import type { ApiUser, RoleplayStartBody, RoleplayTurnBody } from "@ynm/contracts";
import { toSessionUser } from "@ynm/platform-core";

type SessionService = typeof import("../../../src/lib/roleplay/engine/session-service");

let sessionServicePromise: Promise<SessionService> | null = null;
function loadSessionService() {
  sessionServicePromise ??= import("../../../src/lib/roleplay/engine/session-service");
  return sessionServicePromise;
}

async function loadCatalog() {
  return import("../../../src/lib/roleplay/catalog");
}

async function loadScenarioRepository() {
  return import("../../../src/lib/roleplay/scenario-repository");
}

async function loadRoleplayLog() {
  return import("../../../src/lib/roleplay/log-roleplay-event");
}

function isRoleplaySessionError(e: unknown): e is Error & { status: number } {
  return (
    e instanceof Error &&
    typeof (e as { status?: unknown }).status === "number" &&
    e.name === "RoleplaySessionError"
  );
}

function mapSessionError(e: unknown): { error: string; status: number } {
  if (isRoleplaySessionError(e)) {
    return { error: e.message, status: e.status };
  }
  throw e;
}

export async function roleplayStart(user: ApiUser, body: RoleplayStartBody) {
  const sessionUser = toSessionUser(user);
  const {
    startRoleplaySession,
    startRoleplaySessionWithConfig,
  } = await loadSessionService();
  try {
    if (body.scenarioId?.trim() && body.mode !== "custom" && body.mode !== "random") {
      const result = await startRoleplaySession({
        scenarioId: body.scenarioId.trim(),
        personaId: body.personaId?.trim(),
        user: sessionUser,
      });
      return { status: 200 as const, body: result };
    }
    const mode = body.mode === "random" ? "random" : "custom";
    const result = await startRoleplaySessionWithConfig({
      mode,
      config: body.config ?? body,
      user: sessionUser,
    });
    return { status: 200 as const, body: result };
  } catch (e) {
    return mapSessionError(e);
  }
}

export async function roleplayGetSession(user: ApiUser, sessionId: string) {
  const { getRoleplayPracticeBootstrap } = await loadSessionService();
  const bootstrap = await getRoleplayPracticeBootstrap(sessionId, user.userId);
  if (!bootstrap) {
    return { status: 404 as const, error: "找不到場次或已過期" };
  }
  return { status: 200 as const, body: bootstrap };
}

export async function roleplayTurn(_user: ApiUser, sessionId: string, body: RoleplayTurnBody) {
  const { submitRoleplayTurn } = await loadSessionService();
  try {
    const result = await submitRoleplayTurn({
      sessionId,
      message: body.message ?? "",
    });
    return { status: 200 as const, body: result };
  } catch (e) {
    return mapSessionError(e);
  }
}

export async function roleplayFinish(_user: ApiUser, sessionId: string) {
  const {
    finishRoleplaySession,
    getRoleplaySessionForUser,
  } = await loadSessionService();
  const { logRoleplayFinish } = await loadRoleplayLog();
  try {
    const result = await finishRoleplaySession(sessionId);
    const session = getRoleplaySessionForUser(sessionId);
    if (session) {
      await logRoleplayFinish(session);
    }
    return { status: 200 as const, body: result };
  } catch (e) {
    if (isRoleplaySessionError(e)) {
      return { error: e.message, status: e.status };
    }
    const message = e instanceof Error ? e.message : "結束評分失敗";
    console.error("[roleplay] finish failed", e);
    return { error: message, status: 500 };
  }
}

export async function roleplayStats(user: ApiUser) {
  const { getRoleplayStatsForUser } = await loadSessionService();
  const stats = await getRoleplayStatsForUser(toSessionUser(user));
  return stats;
}

export async function roleplayHistory(user: ApiUser, limit: number) {
  const { getRoleplayHistoryForUser } = await loadSessionService();
  const items = await getRoleplayHistoryForUser(user.userId, limit);
  return { items };
}

export async function roleplayConfigOptions() {
  const { getRoleplayConfigOptions } = await loadCatalog();
  return getRoleplayConfigOptions();
}

export async function roleplayScenario(scenarioId: string) {
  const { getRoleplayScenarioDetail } = await loadScenarioRepository();
  const detail = await getRoleplayScenarioDetail(scenarioId);
  if (!detail) return null;
  return detail;
}
