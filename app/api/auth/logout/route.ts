import { NextResponse } from "next/server";
import { clearSession, readSession } from "@/lib/auth/session";
import { writeAuthAudit } from "@/lib/bq/auth-audit";

export async function POST() {
  const user = await readSession();
  await clearSession();
  if (user) {
    await writeAuthAudit({
      action: "logout",
      actorUsername: user.username,
    }).catch(() => null);
  }
  return NextResponse.json({ ok: true });
}

