import { resolveApiUser } from "@ynm/platform-core";
import type { ApiUser } from "@ynm/contracts";
import { headers } from "next/headers";
import { readSalesSession, readSession, type SessionUser } from "@/lib/auth/session";

export function apiUserToSessionUser(user: ApiUser): SessionUser {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    branch: user.branch || undefined,
    role: user.role,
  };
}

/** 從 Authorization Bearer（裕日 IAM / API Key）解析使用者，不含 Cookie fallback */
export async function readUserFromAuthHeader(): Promise<SessionUser | null> {
  const incoming = await headers();
  const webHeaders = new Headers();
  for (const [key, value] of incoming.entries()) {
    webHeaders.set(key, value);
  }
  const apiUser = resolveApiUser(webHeaders);
  return apiUser ? apiUserToSessionUser(apiUser) : null;
}

/** 銷售／對練 API：Bearer 優先，Cookie session 過渡並存 */
export async function readAssistantApiUser(): Promise<SessionUser | null> {
  const fromBearer = await readUserFromAuthHeader();
  if (fromBearer) return fromBearer;
  const sales = await readSalesSession();
  if (sales) return sales;
  const admin = await readSession();
  if (admin) return admin;
  return null;
}
