import type {
  AgentNameOption,
  RoleplayAdminSession,
  RoleplayAgentSummary,
  RoleplayUsageKpis,
} from "@/lib/analytics/types";
import type { RoleplayCompletedDetail } from "@/lib/bq/roleplay-sessions-bq";
import type { PlatformUser } from "@/lib/bq/users";

function durationMin(startedAt: string, finishedAt: string | null): number | null {
  if (!finishedAt?.trim()) return null;
  const a = new Date(startedAt).getTime();
  const b = new Date(finishedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.max(1, Math.round((b - a) / 60000));
}

export function resolveDisplayName(
  userId: string,
  username: string,
  userMap: Map<string, PlatformUser>,
): string {
  const u = userMap.get(userId);
  if (u?.displayName?.trim()) return u.displayName.trim();
  return username.trim() || userId;
}

export function toRoleplayAdminSessions(
  rows: RoleplayCompletedDetail[],
  userMap: Map<string, PlatformUser>,
): RoleplayAdminSession[] {
  return rows.map((r) => ({
    sessionId: r.sessionId,
    userId: r.userId,
    displayName: resolveDisplayName(r.userId, r.username, userMap),
    username: r.username,
    branch: r.branch || "—",
    status: r.status === "STARTED" ? "STARTED" : "COMPLETED",
    targetModel: r.targetModel,
    competitor: r.competitor,
    personaId: r.personaId,
    difficulty: String(r.difficulty),
    score: r.status === "COMPLETED" && Number.isFinite(r.score) ? r.score : null,
    grade: r.grade ?? "",
    startedAt: r.startedAt,
    finishedAt: r.status === "COMPLETED" ? r.finishedAt : null,
    durationMin: durationMin(r.startedAt, r.status === "COMPLETED" ? r.finishedAt : null),
  }));
}

export function filterRoleplaySessions(
  sessions: RoleplayAdminSession[],
  opts: { branch?: string; agentUserId?: string },
): RoleplayAdminSession[] {
  return sessions.filter((s) => {
    if (opts.branch && opts.branch !== "all" && s.branch !== opts.branch) return false;
    if (opts.agentUserId && opts.agentUserId !== "all" && s.userId !== opts.agentUserId) {
      return false;
    }
    return true;
  });
}

export function computeRoleplayKpis(sessions: RoleplayAdminSession[]): RoleplayUsageKpis {
  const agents = new Set(sessions.map((s) => s.userId));
  const completed = sessions.filter((s) => s.status === "COMPLETED");
  const startedOnly = sessions.filter((s) => s.status === "STARTED");
  const scores = completed.map((s) => s.score).filter((n): n is number => n != null);
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  return {
    activeAgents: agents.size,
    completedSessions: completed.length,
    startedIncomplete: startedOnly.length,
    avgScore,
  };
}

export function computeRoleplayAgentSummaries(
  sessions: RoleplayAdminSession[],
): RoleplayAgentSummary[] {
  const byUser = new Map<
    string,
    {
      displayName: string;
      username: string;
      branch: string;
      completed: RoleplayAdminSession[];
      started: number;
    }
  >();

  for (const s of sessions) {
    const cur = byUser.get(s.userId) ?? {
      displayName: s.displayName,
      username: s.username,
      branch: s.branch,
      completed: [],
      started: 0,
    };
    if (s.status === "COMPLETED") cur.completed.push(s);
    else cur.started += 1;
    byUser.set(s.userId, cur);
  }

  return [...byUser.entries()]
    .map(([userId, v]) => {
      const scores = v.completed.map((c) => c.score).filter((n): n is number => n != null);
      const avgScore =
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;
      const lastCompletedAt =
        v.completed.length > 0
          ? v.completed
              .map((c) => c.finishedAt ?? "")
              .sort((a, b) => b.localeCompare(a))[0] || null
          : null;
      return {
        userId,
        displayName: v.displayName,
        username: v.username,
        branch: v.branch,
        completedCount: v.completed.length,
        startedIncomplete: v.started,
        avgScore,
        lastCompletedAt,
      };
    })
    .sort((a, b) => b.completedCount - a.completedCount);
}

export function buildAgentNameOptions(
  sessions: RoleplayAdminSession[],
  users: PlatformUser[],
): AgentNameOption[] {
  const map = new Map<string, AgentNameOption>();
  for (const u of users) {
    if (u.role !== "agent") continue;
    map.set(u.userId, {
      userId: u.userId,
      displayName: u.displayName || u.username,
      username: u.username,
      branch: u.branch,
    });
  }
  for (const s of sessions) {
    if (!map.has(s.userId)) {
      map.set(s.userId, {
        userId: s.userId,
        displayName: s.displayName,
        username: s.username,
        branch: s.branch,
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "zh-Hant"),
  );
}
