import { NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import { getRoleplayStatsForUser } from "@/lib/roleplay/engine/session-service";

export async function GET() {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const stats = await getRoleplayStatsForUser(user);
  return NextResponse.json(stats);
}
