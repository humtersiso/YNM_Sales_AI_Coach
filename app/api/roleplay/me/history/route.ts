import { NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import { getRoleplayHistoryForUser } from "@/lib/roleplay/engine/session-service";

export async function GET(request: Request) {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20") || 20, 50);

  const items = await getRoleplayHistoryForUser(user.userId, limit);
  return NextResponse.json({ items });
}
