import { NextResponse } from "next/server";
import { clearSalesSession, clearSession, readSalesSession, readSession } from "@/lib/auth/session";
import { writeAuthAudit } from "@/lib/bq/auth-audit";

export async function POST() {
  const admin = await readSession();
  const sales = await readSalesSession();

  await clearSession();
  await clearSalesSession();

  const actor = admin?.username ?? sales?.username;
  if (actor) {
    await writeAuthAudit({
      action: "logout",
      actorUsername: actor,
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true });
}
