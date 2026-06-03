import { NextResponse } from "next/server";
import { readSalesSession, readSession } from "@/lib/auth/session";
import { getKnowledgeMetaForClient } from "@/lib/knowledge/search-scope";

export async function GET() {
  const session = (await readSalesSession()) ?? (await readSession());
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  return NextResponse.json(getKnowledgeMetaForClient());
}
