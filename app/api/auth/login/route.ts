import { NextRequest, NextResponse } from "next/server";
import { findUser } from "@/lib/auth/users";
import { setSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const user = findUser(body.username ?? "", body.password ?? "");
  if (!user) {
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }
  await setSession({ username: user.username, displayName: user.displayName });
  return NextResponse.json({ ok: true, user: { username: user.username, displayName: user.displayName } });
}

