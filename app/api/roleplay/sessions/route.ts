import { NextRequest, NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import {
  RoleplaySessionError,
  startRoleplaySession,
} from "@/lib/roleplay/engine/session-service";

export async function POST(request: NextRequest) {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    scenarioId?: string;
    personaId?: string;
  };

  if (!body.scenarioId?.trim()) {
    return NextResponse.json({ error: "請選擇情境" }, { status: 400 });
  }

  try {
    const result = await startRoleplaySession({
      scenarioId: body.scenarioId.trim(),
      personaId: body.personaId?.trim(),
      user,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RoleplaySessionError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
