import { readSession, readSalesSession } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session";

export async function readRoleplayUser(): Promise<SessionUser | null> {
  const sales = await readSalesSession();
  if (sales) return sales;
  const admin = await readSession();
  if (admin) return admin;
  return null;
}
