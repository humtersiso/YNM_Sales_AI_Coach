import type { SessionUser } from "@/lib/auth/session";

/** 測試用 admin：首頁小結缺列時同步補寫 BQ（一般業代仍背景補寫） */
export function isRoleplayAdminTestUser(user: Pick<SessionUser, "username" | "role">): boolean {
  const seed = (process.env.SEED_ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  if (user.role === "admin" || user.role === "super_admin") return true;
  return user.username.trim().toLowerCase() === seed;
}
