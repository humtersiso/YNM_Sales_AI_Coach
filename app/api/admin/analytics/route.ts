import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  computeCategoryBreakdown,
  computeGroupedCompetitorTopics,
} from "@/lib/analytics/competitor-analytics";
import {
  computeUsageKpis,
  computeBranchTopThree,
  filterQueryLogs,
  getBranches,
  type UsageFilters,
} from "@/lib/analytics/usage-analytics";
import { listUsageLogs } from "@/lib/bq/usage-events";

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const section = request.nextUrl.searchParams.get("section") ?? "usage";
  const branch = request.nextUrl.searchParams.get("branch") ?? undefined;
  const assistantType = request.nextUrl.searchParams.get("assistantType") ?? "sales";
  const tenureMin = request.nextUrl.searchParams.get("tenureMin");
  const tenureMax = request.nextUrl.searchParams.get("tenureMax");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom") ?? undefined;
  const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;

  const filters: UsageFilters = {
    branch: branch === "all" ? undefined : branch,
    assistantType: "sales",
    tenureMin: tenureMin ? Number(tenureMin) : undefined,
    tenureMax: tenureMax ? Number(tenureMax) : undefined,
    dateFrom,
    dateTo,
  };

  if (section === "leaderboard") {
    const allLogs = await listUsageLogs({ assistantType: "sales" });
    return NextResponse.json({
      branches: getBranches(allLogs),
      branchCards: computeBranchTopThree(allLogs),
    });
  }

  const sourceLogs = await listUsageLogs({
    branch,
    assistantType: assistantType === "roleplay" ? "roleplay" : "sales",
    dateFrom,
    dateTo,
  });
  const branches = getBranches(sourceLogs);

  if (section === "top10") {
    const logs = filterQueryLogs(sourceLogs, {
      ...filters,
      assistantType: assistantType === "roleplay" ? "roleplay" : "sales",
    });
    const salesOnly = assistantType === "roleplay" ? [] : logs;
    return NextResponse.json({
      groupedTopics: computeGroupedCompetitorTopics(salesOnly, 85),
      categoryStats: computeCategoryBreakdown(salesOnly),
      assistantType,
    });
  }

  if (assistantType === "roleplay") {
    return NextResponse.json({
      assistantType: "roleplay",
      branches,
      kpis: { activeAgents: 0, sessionCount: 0, avgScore: 0, avgDurationMin: 0 },
      roleplayLogs: [],
    });
  }

  const logs = filterQueryLogs(sourceLogs, filters);

  return NextResponse.json({
    assistantType: "sales",
    branches,
    filters,
    kpis: computeUsageKpis(logs),
    logs,
  });
}
