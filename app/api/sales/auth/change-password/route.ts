import { NextRequest, NextResponse } from "next/server";
import { hashPassword, isValidPasswordPolicy, verifyPassword } from "@/lib/auth/password";
import { clearSalesSession, readSalesSession, setSalesSession } from "@/lib/auth/session";
import { writeAuthAudit } from "@/lib/bq/auth-audit";
import { changePassword, findUserByUsername } from "@/lib/bq/users";

export async function POST(request: NextRequest) {
  const session = await readSalesSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
  };
  const currentPassword = body.currentPassword ?? "";
  const newPassword = (body.newPassword ?? "").trim();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "請輸入目前密碼與新密碼" }, { status: 400 });
  }
  if (!isValidPasswordPolicy(newPassword)) {
    return NextResponse.json({ error: "新密碼需至少 8 碼且包含英數" }, { status: 400 });
  }

  const user = await findUserByUsername(session.username);
  if (!user || user.status !== "active" || user.role !== "agent") {
    await clearSalesSession();
    return NextResponse.json({ error: "帳號狀態無效，請重新登入" }, { status: 401 });
  }

  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) {
    return NextResponse.json({ error: "目前密碼錯誤" }, { status: 400 });
  }
  const sameAsCurrent = await verifyPassword(newPassword, user.passwordHash);
  if (sameAsCurrent) {
    return NextResponse.json({ error: "新密碼不可與目前密碼相同" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await changePassword(user.userId, passwordHash);
  await setSalesSession({
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    branch: user.branch,
    mustChangePassword: false,
  });
  await writeAuthAudit({
    action: "password_changed",
    actorUsername: user.username,
    targetUsername: user.username,
  }).catch(() => null);

  return NextResponse.json({ ok: true });
}
