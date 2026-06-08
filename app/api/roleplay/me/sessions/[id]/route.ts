import { NextRequest, NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import { getAdminRoleplaySessionById } from "@/lib/bq/roleplay-sessions-bq";
import { buildRoleplaySessionDetail } from "@/lib/roleplay/roleplay-session-detail";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const { id } = await context.params;
  const detail = await getAdminRoleplaySessionById(id);
  if (!detail || detail.userId !== user.userId) {
    return NextResponse.json({ error: "找不到對練紀錄" }, { status: 404 });
  }

  const view = await buildRoleplaySessionDetail(detail);
  return NextResponse.json(view);
}
