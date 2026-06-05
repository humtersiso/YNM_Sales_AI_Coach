import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  computeCategoryBreakdown,
  computeGroupedCompetitorTopics,
} from "@/lib/analytics/competitor-analytics";
import {
  buildSalesAgentNameOptions,
  computeUsageKpis,
  computeBranchTopThree,
  filterQueryLogs,
  getBranches,
  type UsageFilters,
} from "@/lib/analytics/usage-analytics";
import {
  buildAgentNameOptions,
  computeRoleplayAgentSummaries,
  computeRoleplayKpis,
  filterRoleplaySessions,
  toRoleplayAdminSessions,
} from "@/lib/analytics/roleplay-usage-analytics";
import { listAdminRoleplaySessions } from "@/lib/bq/roleplay-sessions-bq";
import { listUsageLogs } from "@/lib/bq/usage-events";
import { listUsers } from "@/lib/bq/users";

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const section = request.nextUrl.searchParams.get("section") ?? "usage";
  const branch = request.nextUrl.searchParams.get("branch") ?? undefined;
  const assistantType = request.nextUrl.searchParams.get("assistantType") ?? "sales";
  const agentUserId = request.nextUrl.searchParams.get("agentUserId") ?? undefined;
  const tenureMin = request.nextUrl.searchParams.get("tenureMin");
  const tenureMax = request.nextUrl.searchParams.get("tenureMax");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom") ?? undefined;
  const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;

  const filters: UsageFilters = {
    branch: branch === "all" ? undefined : branch,
    assistantType: assistantType === "roleplay" ? "roleplay" : "sales",
    tenureMin: tenureMin ? Number(tenureMin) : undefined,
    tenureMax: tenureMax ? Number(tenureMax) : undefined,
    dateFrom,
    dateTo,
    agentUserId: agentUserId === "all" || !agentUserId ? undefined : agentUserId,
  };

  if (section === "leaderboard") {
    const allLogs = await listUsageLogs({ assistantType: "sales" });
    return NextResponse.json({
      branches: getBranches(allLogs),
      branchCards: computeBranchTopThree(allLogs),
    });
  }

  if (assistantType === "roleplay") {
    const [rawSessions, users] = await Promise.all([
      listAdminRoleplaySessions(500),
      listUsers({ role: "agent", status: "active" }),
    ]);
    const userMap = new Map(users.map((u) => [u.userId, u]));
    const allSessions = toRoleplayAdminSessions(rawSessions, userMap);
    const agentNames = buildAgentNameOptions(allSessions, users);
    const branches = [...new Set(allSessions.map((s) => s.branch).filter(Boolean))].sort();
    const filtered = filterRoleplaySessions(allSessions, {
      branch: branch === "all" ? undefined : branch,
      agentUserId: filters.agentUserId,
    });
    const agentSummaries = computeRoleplayAgentSummaries(
      filterRoleplaySessions(allSessions, {
        branch: branch === "all" ? undefined : branch,
      }),
    );

    return NextResponse.json({
      assistantType: "roleplay",
      branches,
      agentNames,
      kpis: computeRoleplayKpis(filtered),
      agentSummaries,
      sessions: filtered,
    });
  }

  const sourceLogs = await listUsageLogs({
    branch,
    assistantType: "sales",
    dateFrom,
    dateTo,
  });
  const users = await listUsers({ role: "agent", status: "active" });
  const branches = getBranches(sourceLogs);
  const agentNames = buildSalesAgentNameOptions(sourceLogs, users);

  if (section === "top10") {
    const logs = filterQueryLogs(sourceLogs, { ...filters, assistantType: "sales" });
    return NextResponse.json({
      groupedTopics: computeGroupedCompetitorTopics(logs, 85),
      categoryStats: computeCategoryBreakdown(logs),
      assistantType: "sales",
      agentNames,
      branches,
    });
  }

  const logs = filterQueryLogs(sourceLogs, filters);

  return NextResponse.json({
    assistantType: "sales",
    branches,
    agentNames,
    filters,
    kpis: computeUsageKpis(logs),
    logs,
  });
}
