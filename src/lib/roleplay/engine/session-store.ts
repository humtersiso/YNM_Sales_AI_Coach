import { randomUUID } from "node:crypto";
import type { RoleplaySessionRecord } from "@/lib/bq/roleplay-sessions-bq";
import type { RoleplaySession } from "@/lib/roleplay/session-types";

type RoleplaySessionStoreGlobal = {
  roleplaySessions?: Map<string, RoleplaySession>;
  roleplayFinishedArchive?: RoleplaySessionRecord[];
};

const g = globalThis as typeof globalThis & RoleplaySessionStoreGlobal;

function sessions(): Map<string, RoleplaySession> {
  if (!g.roleplaySessions) {
    g.roleplaySessions = new Map();
  }
  return g.roleplaySessions;
}

function finishedArchive(): RoleplaySessionRecord[] {
  if (!g.roleplayFinishedArchive) {
    g.roleplayFinishedArchive = [];
  }
  return g.roleplayFinishedArchive;
}

export function createSessionId(): string {
  return randomUUID();
}

export function saveSession(session: RoleplaySession): void {
  sessions().set(session.sessionId, session);
}

export function getSession(sessionId: string): RoleplaySession | null {
  return sessions().get(sessionId) ?? null;
}

export function deleteSession(sessionId: string): void {
  sessions().delete(sessionId);
}

export function archiveFinishedSession(record: RoleplaySessionRecord): void {
  const archive = finishedArchive();
  archive.unshift(record);
  if (archive.length > 200) archive.pop();
}

export function listArchivedSessionsForUser(userId: string): RoleplaySessionRecord[] {
  return finishedArchive().filter((r) => r.userId === userId);
}
