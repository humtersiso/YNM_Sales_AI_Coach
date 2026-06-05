import type { AgentLeaderboardRow, BranchLeaderboardCard, QueryLog, UsageFilters } from "@/lib/analytics/types";
export type { UsageFilters };

function inDateRange(iso: string, from?: string, to?: string) {
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 86400000) return false;
  return true;
}

export function filterQueryLogs(logs: QueryLog[], f: UsageFilters) {
  return logs.filter((row) => {
    if (f.agentUserId && f.agentUserId !== "all" && row.userId !== f.agentUserId) return false;
    if (f.branch && f.branch !== "all" && row.branch !== f.branch) return false;
    if (f.assistantType && f.assistantType !== "all" && row.assistantType !== f.assistantType) return false;
    if (f.tenureMin != null && row.tenureYears < f.tenureMin) return false;
    if (f.tenureMax != null && row.tenureYears > f.tenureMax) return false;
    if (!inDateRange(row.askedAt, f.dateFrom, f.dateTo)) return false;
    return true;
  });
}

export function computeUsageKpis(logs: QueryLog[]) {
  const agents = new Set(logs.map((l) => l.agentName));
  const count = logs.length;
  return {
    activeAgents: agents.size,
    totalQuestions: count,
    avgPerAgent: agents.size ? Math.round((count / agents.size) * 10) / 10 : 0,
  };
}

export function getBranches(logs: QueryLog[]): string[] {
  return [...new Set(logs.map((l) => l.branch).filter(Boolean))].sort();
}

export function buildSalesAgentNameOptions(
  logs: QueryLog[],
  users: { userId: string; displayName: string; username: string; branch: string; role: string }[],
): { userId: string; displayName: string; username: string; branch: string }[] {
  const map = new Map<string, { userId: string; displayName: string; username: string; branch: string }>();
  for (const u of users) {
    if (u.role !== "agent") continue;
    map.set(u.userId, {
      userId: u.userId,
      displayName: u.displayName || u.username,
      username: u.username,
      branch: u.branch,
    });
  }
  for (const l of logs) {
    if (!l.userId || map.has(l.userId)) continue;
    map.set(l.userId, {
      userId: l.userId,
      displayName: l.agentName,
      username: l.agentName,
      branch: l.branch,
    });
  }
  return [...map.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "zh-Hant"),
  );
}

export function computeBranchTopThree(logs: QueryLog[]): BranchLeaderboardCard[] {
  const key = (x: QueryLog) => `${x.agentName}::${x.branch}`;
  const grouped = new Map<string, { name: string; branch: string; tenureYears: number; count: number }>();
  for (const row of logs) {
    const k = key(row);
    const cur = grouped.get(k) ?? {
      name: row.agentName,
      branch: row.branch,
      tenureYears: row.tenureYears,
      count: 0,
    };
    cur.count += 1;
    grouped.set(k, cur);
  }

  const rows: AgentLeaderboardRow[] = [...grouped.entries()].map(([id, v]) => {
    const usageScore = Math.min(100, 50 + v.count * 5);
    const performanceScore = usageScore;
    const compositeScore = Math.round((usageScore + performanceScore) / 2);
    return {
      id,
      name: v.name,
      branch: v.branch,
      tenureYears: v.tenureYears,
      usageScore,
      performanceScore,
      compositeScore,
    };
  });

  const branches = [...new Set(rows.map((r) => r.branch))].sort();
  return branches.map((branch) => ({
    branch,
    topThree: rows
      .filter((r) => r.branch === branch)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 3),
  }));
}
