import { NextRequest, NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import {
  getRoleplayPracticeBootstrap,
  getRoleplaySessionForUser,
} from "@/lib/roleplay/engine/session-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const { id } = await context.params;
  const bootstrap = await getRoleplayPracticeBootstrap(id, user.userId);
  if (!bootstrap) {
    return NextResponse.json({ error: "找不到場次或已過期" }, { status: 404 });
  }

  return NextResponse.json(bootstrap);
}
