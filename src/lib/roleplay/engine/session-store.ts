import { randomUUID } from "node:crypto";
import type { RoleplaySession } from "@/lib/roleplay/session-types";

const sessions = new Map<string, RoleplaySession>();

export function createSessionId(): string {
  return randomUUID();
}

export function saveSession(session: RoleplaySession): void {
  sessions.set(session.sessionId, session);
}

export function getSession(sessionId: string): RoleplaySession | null {
  return sessions.get(sessionId) ?? null;
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}
