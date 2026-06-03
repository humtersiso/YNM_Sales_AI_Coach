import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { setSalesSession } from "@/lib/auth/session";
import { writeAuthAudit } from "@/lib/bq/auth-audit";
import { findUserByUsername, markLoginSuccess } from "@/lib/bq/users";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  const user = await findUserByUsername(username);
  if (!user || user.role !== "agent") {
    await writeAuthAudit({
      action: "login_failed",
      actorUsername: username || "unknown",
      ipAddress: ip,
    }).catch(() => null);
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }
  if (user.status !== "active") {
    await writeAuthAudit({
      action: "login_failed",
      actorUsername: user.username,
      ipAddress: ip,
      detail: { reason: "disabled" },
    }).catch(() => null);
    return NextResponse.json({ error: "帳號已停用，請聯絡管理員" }, { status: 403 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await writeAuthAudit({
      action: "login_failed",
      actorUsername: user.username,
      ipAddress: ip,
    }).catch(() => null);
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  await setSalesSession({
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    branch: user.branch,
    mustChangePassword: user.mustChangePassword,
  });
  await markLoginSuccess(user.userId).catch(() => null);
  await writeAuthAudit({
    action: "login_success",
    actorUsername: user.username,
    ipAddress: ip,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    user: {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      branch: user.branch,
      mustChangePassword: user.mustChangePassword,
    },
  });
}
