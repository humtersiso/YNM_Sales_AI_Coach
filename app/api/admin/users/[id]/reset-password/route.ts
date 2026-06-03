import { NextRequest, NextResponse } from "next/server";
import { generateRandomPassword, hashPassword } from "@/lib/auth/password";
import { readSession } from "@/lib/auth/session";
import { writeAuthAudit } from "@/lib/bq/auth-audit";
import { listUsers, resetPassword } from "@/lib/bq/users";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { id } = await params;
  const users = await listUsers();
  const target = users.find((u) => u.userId === id);
  if (!target) return NextResponse.json({ error: "找不到使用者" }, { status: 404 });

  const rawPassword = generateRandomPassword(12);
  const passwordHash = await hashPassword(rawPassword);
  await resetPassword(target.userId, passwordHash);

  await writeAuthAudit({
    action: "password_reset",
    actorUsername: session.username,
    targetUsername: target.username,
  }).catch(() => null);

  const origin = process.env.APP_PUBLIC_URL?.trim() || request.nextUrl.origin;
  const loginUrl = `${origin.replace(/\/$/, "")}/login?u=${encodeURIComponent(target.username)}`;
  return NextResponse.json({
    user: target,
    initialPassword: rawPassword,
    loginUrl,
  });
}
