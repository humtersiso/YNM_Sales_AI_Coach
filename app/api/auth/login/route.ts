import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { setAdminSession } from "@/lib/auth/session";
import { writeAuthAudit } from "@/lib/bq/auth-audit";
import { findUserByUsername, markLoginSuccess } from "@/lib/bq/users";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  const user = await findUserByUsername(username);
  const ok =
    !!user &&
    user.role === "admin" &&
    user.status === "active" &&
    (await verifyPassword(password, user.passwordHash));
  if (!ok || !user) {
    await writeAuthAudit({
      action: "login_failed",
      actorUsername: username || "unknown",
      ipAddress: ip,
    }).catch(() => null);
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  await setAdminSession({
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    branch: user.branch,
  });
  await markLoginSuccess(user.userId).catch(() => null);
  await writeAuthAudit({
    action: "login_success",
    actorUsername: user.username,
    ipAddress: ip,
  }).catch(() => null);
  return NextResponse.json({ ok: true, user: { username: user.username, displayName: user.displayName } });
}

