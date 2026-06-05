import { NextRequest, NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import {
  RoleplaySessionError,
  finishRoleplaySession,
  getRoleplaySessionForUser,
} from "@/lib/roleplay/engine/session-service";
import { logRoleplayFinish } from "@/lib/roleplay/log-roleplay-event";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const result = await finishRoleplaySession(id);
    const session = getRoleplaySessionForUser(id);
    if (session) {
      await logRoleplayFinish(session);
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RoleplaySessionError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : "結束評分失敗";
    console.error("[roleplay] finish failed", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
