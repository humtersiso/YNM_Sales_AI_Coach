import { NextResponse } from "next/server";
import { readAssistantApiUser } from "@/lib/auth/api-auth";
import { getKnowledgeMetaForClient } from "@/lib/knowledge/search-scope";

export async function GET() {
  const session = await readAssistantApiUser();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  return NextResponse.json(getKnowledgeMetaForClient());
}
