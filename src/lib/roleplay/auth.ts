import { readAssistantApiUser } from "@/lib/auth/api-auth";
import type { SessionUser } from "@/lib/auth/session";

/** Bearer 優先；Cookie session 僅供內部 demo 過渡 */
export async function readRoleplayUser(): Promise<SessionUser | null> {
  return readAssistantApiUser();
}
