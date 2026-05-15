import { NextRequest, NextResponse } from "next/server";
import { upsertQuestionTag } from "@/lib/excel-store/store";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    questionId: string;
    tagId: string;
  };
  if (!body.questionId || !body.tagId) {
    return NextResponse.json({ error: "缺少欄位" }, { status: 400 });
  }

  const rel = upsertQuestionTag(body.questionId, body.tagId);
  return NextResponse.json({ rel });
}
