import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { resolveDisplayName } from "@/lib/analytics/roleplay-usage-analytics";
import {
  completedDetailToHistoryItem,
  getAdminRoleplaySessionById,
  parseRoleplayTranscriptLines,
} from "@/lib/bq/roleplay-sessions-bq";
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
  const historyItem =
    detail.status === "COMPLETED" ? completedDetailToHistoryItem(detail) : null;
  const transcriptLines = parseRoleplayTranscriptLines(detail.transcript);

  return NextResponse.json({
    sessionId: detail.sessionId,
    userId: detail.userId,
    displayName,
    username: detail.username,
    branch: detail.branch || "—",
    status: detail.status,
    targetModel: detail.targetModel,
    competitor: detail.competitor,
    personaId: detail.personaId,
    difficulty: String(detail.difficulty),
    score: detail.status === "COMPLETED" ? detail.score : null,
    grade: detail.grade,
    startedAt: detail.startedAt,
    finishedAt: detail.status === "COMPLETED" ? detail.finishedAt : null,
    historyItem,
    transcriptLines,
  });
}
