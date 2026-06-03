import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { clearSalesSession, clearSession, setAdminSession, setSalesSession } from "@/lib/auth/session";
import { writeAuthAudit } from "@/lib/bq/auth-audit";
import { findUserForLogin, markLoginSuccess } from "@/lib/bq/users";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  let user;
  try {
    user = await findUserForLogin(username);
  } catch (e) {
    console.error("findUserForLogin failed", e);
    const msg = String(e instanceof Error ? e.message : e);
    const needsReauth =
      /invalid_grant|invalid_rapt|reauth|Could not load the default credentials/i.test(msg);
    return NextResponse.json(
      {
        error: needsReauth
          ? "無法連線 BigQuery（本機 Google 憑證已過期）。請在終端機執行：gcloud auth application-default login"
          : "登入服務暫時無法使用，請稍後再試或聯絡管理員",
      },
      { status: 503 },
    );
  }
  if (!user) {
    void writeAuthAudit({
      action: "login_failed",
      actorUsername: username || "unknown",
      ipAddress: ip,
    }).catch(() => null);
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }
  if (user.status !== "active") {
    void writeAuthAudit({
      action: "login_failed",
      actorUsername: user.username,
      ipAddress: ip,
      detail: { reason: "disabled" },
    }).catch(() => null);
    return NextResponse.json({ error: "帳號已停用，請聯絡管理員" }, { status: 403 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    void writeAuthAudit({
      action: "login_failed",
      actorUsername: user.username,
      ipAddress: ip,
    }).catch(() => null);
    return NextResponse.json({ error: "帳號或密碼錯誤" }, { status: 401 });
  }

  // Ensure only one active role session exists.
  await clearSession();
  await clearSalesSession();

  if (user.role === "admin") {
    await setAdminSession({
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      branch: user.branch,
    });
  } else {
    await setSalesSession({
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      branch: user.branch,
      mustChangePassword: user.mustChangePassword,
    });
  }

  void markLoginSuccess(user.userId).catch(() => null);
  void writeAuthAudit({
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
      role: user.role,
      mustChangePassword: user.role === "agent" ? user.mustChangePassword : false,
    },
  });
}
