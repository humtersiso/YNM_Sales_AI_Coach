import { NextRequest, NextResponse } from "next/server";
import { upsertSuggestion } from "@/lib/excel-store/store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    questionId: string;
    expertId: string;
    content: string;
  };

  if (!body.questionId || !body.expertId || !body.content?.trim()) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }

  const suggestion = upsertSuggestion(body.questionId, body.expertId, body.content);
  return NextResponse.json({ suggestion });
}
