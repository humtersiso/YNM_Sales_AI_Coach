import type { AppRole, SessionUser } from "@/lib/auth/session";
import type { PlatformUser } from "@/lib/bq/users";

export type PlatformRole = PlatformUser["role"];

export function isPortalAdminRole(role: AppRole | PlatformRole): boolean {
  return role === "admin" || role === "super_admin";
}

export function canManageAdminAccounts(session: SessionUser | null | undefined): boolean {
  return session?.role === "super_admin";
}

/** 需 super_admin 才能管理的帳號類型 */
export function isPrivilegedAdminTarget(role: PlatformRole): boolean {
  return role === "admin" || role === "super_admin";
}

export function canManageUser(
  actor: SessionUser,
  target: Pick<PlatformUser, "role" | "username">,
): boolean {
  if (target.username === actor.username) return false;
  if (!isPrivilegedAdminTarget(target.role)) return true;
  return canManageAdminAccounts(actor);
}
