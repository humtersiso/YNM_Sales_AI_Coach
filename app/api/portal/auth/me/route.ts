import { NextResponse } from "next/server";
import { readSalesSession, readSession } from "@/lib/auth/session";

export async function GET() {
  const admin = await readSession();
  if (admin) return NextResponse.json({ user: admin });

  const sales = await readSalesSession();
  if (sales) return NextResponse.json({ user: sales });

  return NextResponse.json({ error: "未登入" }, { status: 401 });
}
