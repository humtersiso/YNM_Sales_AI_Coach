import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { resolveDisplayName } from "@/lib/analytics/roleplay-usage-analytics";
import { getAdminRoleplaySessionById } from "@/lib/bq/roleplay-sessions-bq";
import { buildRoleplaySessionDetail } from "@/lib/roleplay/roleplay-session-detail";
import { listUsers } from "@/lib/bq/users";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const { id } = await context.params;
  const detail = await getAdminRoleplaySessionById(id);
  if (!detail) {
    return NextResponse.json({ error: "找不到對練紀錄" }, { status: 404 });
  }

  const users = await listUsers({ status: "active" });
  const userMap = new Map(users.map((u) => [u.userId, u]));
  const displayName = resolveDisplayName(detail.userId, detail.username, userMap);
  const view = await buildRoleplaySessionDetail(detail, { displayName });

  return NextResponse.json({
    ...view,
    userId: detail.userId,
    username: detail.username,
    branch: detail.branch || "—",
    personaId: detail.personaId,
    difficulty: String(detail.difficulty),
    finishedAt: detail.status === "COMPLETED" ? detail.finishedAt : null,
  });
}
