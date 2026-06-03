import { NextRequest, NextResponse } from "next/server";
import { generateRandomPassword, hashPassword, isValidPasswordPolicy } from "@/lib/auth/password";
import { readSession } from "@/lib/auth/session";
import { writeAuthAudit } from "@/lib/bq/auth-audit";
import { createUser, listUsers } from "@/lib/bq/users";

function ensureAdmin() {
  return readSession();
}

export async function GET(request: NextRequest) {
  const session = await ensureAdmin();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const role = request.nextUrl.searchParams.get("role") as "admin" | "agent" | null;
  const branch = request.nextUrl.searchParams.get("branch");
  const status = request.nextUrl.searchParams.get("status") as "active" | "disabled" | null;
  const q = request.nextUrl.searchParams.get("q");

  const users = await listUsers({
    role: role ?? undefined,
    branch: branch ?? undefined,
    status: status ?? undefined,
    q: q ?? undefined,
  });
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const session = await ensureAdmin();
  if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    displayName?: string;
    branch?: string;
    role?: "admin" | "agent";
    tenureYears?: number;
    password?: string;
  };

  const username = (body.username ?? "").trim();
  const displayName = (body.displayName ?? "").trim();
  const branch = (body.branch ?? "").trim();
  const role = body.role === "admin" ? "admin" : "agent";
  const rawPassword = (body.password ?? "").trim() || generateRandomPassword(12);
  const tenureYears = Number(body.tenureYears ?? 0);

  if (!username || !displayName || !branch) {
    return NextResponse.json({ error: "請填寫帳號、姓名、據點" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_]{3,32}$/.test(username)) {
    return NextResponse.json({ error: "帳號格式需為 3-32 碼英數或底線" }, { status: 400 });
  }
  if (!Number.isFinite(tenureYears) || tenureYears < 0 || tenureYears > 50) {
    return NextResponse.json({ error: "年資請填 0~50 之間的數字" }, { status: 400 });
  }
  if (!isValidPasswordPolicy(rawPassword)) {
    return NextResponse.json({ error: "密碼需至少 8 碼且包含英數" }, { status: 400 });
  }

  const passwordHash = await hashPassword(rawPassword);
  const user = await createUser({
    username,
    passwordHash,
    role,
    displayName,
    branch,
    tenureYears,
    createdBy: session.username,
  });

  const origin = process.env.APP_PUBLIC_URL?.trim() || request.nextUrl.origin;
  const loginUrl = `${origin.replace(/\/$/, "")}/login?u=${encodeURIComponent(user.username)}`;

  await writeAuthAudit({
    action: "user_created",
    actorUsername: session.username,
    targetUsername: user.username,
  }).catch(() => null);

  return NextResponse.json({
    user,
    initialPassword: rawPassword,
    loginUrl,
  });
}
