import { NextRequest, NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import { getRoleplaySessionForUser } from "@/lib/roleplay/engine/session-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const { id } = await context.params;
  const session = getRoleplaySessionForUser(id);
  if (!session) {
    return NextResponse.json({ error: "找不到場次" }, { status: 404 });
  }

  return NextResponse.json({
    sessionId: session.sessionId,
    scenarioTitle: session.scenario.sectionA.title,
    status: session.status,
    agentTurnCount: session.agentTurnCount,
    maxTurns: session.maxTurns,
    scoreResult: session.scoreResult ?? null,
  });
}
