import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  return NextResponse.json({ user: session });
}

