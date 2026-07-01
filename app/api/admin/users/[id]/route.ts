import { NextRequest, NextResponse } from "next/server";
import { canManageUser } from "@/lib/auth/admin-policy";
import { readSession } from "@/lib/auth/session";
import { countActiveAdmins, countActiveSuperAdmins, deleteUser, findUserById, updateUser } from "@/lib/bq/users";
import { writeAuthAudit } from "@/lib/bq/auth-audit";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await readSession();
    if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "缺少使用者 ID" }, { status: 400 });
    const body = (await request.json().catch(() => ({}))) as {
      displayName?: string;
      branch?: string;
      tenureYears?: number;
      status?: "active" | "disabled";
    };
    if (
      body.tenureYears != null &&
      (!Number.isFinite(body.tenureYears) || body.tenureYears < 0 || body.tenureYears > 50)
    ) {
      return NextResponse.json({ error: "年資請填 0~50 之間的數字" }, { status: 400 });
    }
    const target = await findUserById(id);
    if (!target) return NextResponse.json({ error: "找不到使用者" }, { status: 404 });
    if (!canManageUser(session, target)) {
      return NextResponse.json({ error: "僅 super admin 可管理管理員帳號" }, { status: 403 });
    }
    if (body.status === "disabled" && target.role === "super_admin") {
      const superAdminCount = await countActiveSuperAdmins();
      if (superAdminCount <= 1) {
        return NextResponse.json({ error: "至少需保留一位啟用中的 super admin" }, { status: 400 });
      }
    }
    await updateUser(id, {
      displayName: body.displayName,
      branch: body.branch,
      tenureYears: body.tenureYears,
      status: body.status,
    });

    if (body.status === "disabled") {
      await writeAuthAudit({
        action: "user_disabled",
        actorUsername: session.username,
        targetUsername: id,
      }).catch(() => null);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新使用者失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await readSession();
    if (!session) return NextResponse.json({ error: "未登入" }, { status: 401 });
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "缺少使用者 ID" }, { status: 400 });

    const target = await findUserById(id);
    if (!target) return NextResponse.json({ error: "找不到使用者" }, { status: 404 });
    if (!canManageUser(session, target)) {
      return NextResponse.json({ error: "僅 super admin 可管理管理員帳號" }, { status: 403 });
    }
    if (target.role === "super_admin") {
      const superAdminCount = await countActiveSuperAdmins();
      if (superAdminCount <= 1) {
        return NextResponse.json({ error: "至少需保留一位 super admin" }, { status: 400 });
      }
    }
    if (target.role === "admin" && target.status === "active") {
      const adminCount = await countActiveAdmins();
      if (adminCount <= 1 && (await countActiveSuperAdmins()) === 0) {
        return NextResponse.json({ error: "至少需保留一位啟用中的管理員" }, { status: 400 });
      }
    }

    await deleteUser(id);
    await writeAuthAudit({
      action: "user_deleted",
      actorUsername: session.username,
      targetUsername: target.username,
    }).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "刪除使用者失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
