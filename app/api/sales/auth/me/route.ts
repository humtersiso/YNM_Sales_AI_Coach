import { NextResponse } from "next/server";
import { readSalesSession, readSession } from "@/lib/auth/session";

export async function GET() {
  const salesSession = await readSalesSession();
  if (salesSession) {
    return NextResponse.json({ user: salesSession });
  }

  const adminSession = await readSession();
  if (!adminSession) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  return NextResponse.json({ user: adminSession });
}
