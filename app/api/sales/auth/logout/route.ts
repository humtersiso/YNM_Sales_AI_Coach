import { NextResponse } from "next/server";
import { clearSalesSession, readSalesSession } from "@/lib/auth/session";
import { writeAuthAudit } from "@/lib/bq/auth-audit";

export async function POST() {
  const user = await readSalesSession();
  await clearSalesSession();
  if (user) {
    await writeAuthAudit({
      action: "logout",
      actorUsername: user.username,
    }).catch(() => null);
  }
  return NextResponse.json({ ok: true });
}
