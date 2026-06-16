import type { RoleplayStartBody, RoleplayTurnBody } from "@ynm/contracts";
import {
  roleplayConfigOptions,
  roleplayFinish,
  roleplayGetSession,
  roleplayHistory,
  roleplayScenario,
  roleplayStart,
  roleplayStats,
  roleplayTurn,
} from "@ynm/roleplay-core";
import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";

export const roleplayRoutes = new Hono<{ Variables: AuthVariables }>();

roleplayRoutes.use("*", requireAuth);

roleplayRoutes.post("/sessions", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json().catch(() => ({}))) as RoleplayStartBody;
  const result = await roleplayStart(user, body);
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as 400);
  }
  return c.json(result.body);
});

roleplayRoutes.get("/sessions/:sessionId", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.param("sessionId");
  const result = await roleplayGetSession(user, sessionId);
  if ("error" in result) {
    return c.json({ error: result.error }, result.status);
  }
  return c.json(result.body);
});

roleplayRoutes.post("/sessions/:sessionId/turn", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.param("sessionId");
  const body = (await c.req.json().catch(() => ({}))) as RoleplayTurnBody;
  const result = await roleplayTurn(user, sessionId, body);
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as 400);
  }
  return c.json(result.body);
});

roleplayRoutes.post("/sessions/:sessionId/finish", async (c) => {
  const user = c.get("user");
  const sessionId = c.req.param("sessionId");
  const result = await roleplayFinish(user, sessionId);
  if ("error" in result) {
    return c.json({ error: result.error }, result.status as 500);
  }
  return c.json(result.body);
});

roleplayRoutes.get("/me/stats", async (c) => {
  const user = c.get("user");
  const stats = await roleplayStats(user);
  return c.json(stats);
});

roleplayRoutes.get("/me/history", async (c) => {
  const user = c.get("user");
  const limit = Math.min(Number(c.req.query("limit") ?? "20") || 20, 50);
  const data = await roleplayHistory(user, limit);
  return c.json(data);
});

roleplayRoutes.get("/config-options", async (c) => {
  return c.json(await roleplayConfigOptions());
});

roleplayRoutes.get("/scenarios/:scenarioId", async (c) => {
  const scenarioId = c.req.param("scenarioId");
  const detail = await roleplayScenario(scenarioId);
  if (!detail) {
    return c.json({ error: "找不到情境" }, 404);
  }
  return c.json(detail);
});
