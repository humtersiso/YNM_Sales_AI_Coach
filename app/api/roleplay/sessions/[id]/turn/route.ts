import { NextRequest, NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import {
  RoleplaySessionError,
  submitRoleplayTurn,
} from "@/lib/roleplay/engine/session-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { message?: string };

  try {
    const result = await submitRoleplayTurn({
      sessionId: id,
      message: body.message ?? "",
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RoleplaySessionError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
