import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import {
  computeTopCompetitorQuestions,
  computeUsageKpis,
  filterLeaderboard,
  filterQueryLogs,
  getBranches,
  mockLeaderboard,
  mockQueryLogs,
  type UsageFilters,
} from "@/lib/mock/usage-analytics";

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const section = request.nextUrl.searchParams.get("section") ?? "usage";
  const branch = request.nextUrl.searchParams.get("branch") ?? undefined;
  const assistantType = (request.nextUrl.searchParams.get("assistantType") ?? "all") as UsageFilters["assistantType"];
  const tenureMin = request.nextUrl.searchParams.get("tenureMin");
  const tenureMax = request.nextUrl.searchParams.get("tenureMax");
  const dateFrom = request.nextUrl.searchParams.get("dateFrom") ?? undefined;
  const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;

  const filters: UsageFilters = {
    branch: branch === "all" ? undefined : branch,
    assistantType,
    tenureMin: tenureMin ? Number(tenureMin) : undefined,
    tenureMax: tenureMax ? Number(tenureMax) : undefined,
    dateFrom,
    dateTo,
  };

  if (section === "leaderboard") {
    return NextResponse.json({
      branches: getBranches(),
      rows: filterLeaderboard(mockLeaderboard, branch ?? undefined),
    });
  }

  if (section === "top10") {
    const logs = filterQueryLogs(mockQueryLogs, filters);
    return NextResponse.json({
      items: computeTopCompetitorQuestions(logs, 10),
    });
  }

  const logs = filterQueryLogs(mockQueryLogs, filters);
  return NextResponse.json({
    branches: getBranches(),
    filters,
    kpis: computeUsageKpis(logs),
    logs,
  });
}
