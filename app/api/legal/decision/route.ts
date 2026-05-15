import { NextRequest, NextResponse } from "next/server";
import { setQuestionLegalDecision } from "@/lib/excel-store/store";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    questionId?: string;
    decision?: "pending_review" | "approved" | "rejected";
    comments?: string;
  };
  if (!body.questionId || !body.decision) {
    return NextResponse.json({ error: "缺少必要欄位" }, { status: 400 });
  }
  try {
    const question = setQuestionLegalDecision(body.questionId, body.decision, body.comments);
    return NextResponse.json({ question });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新失敗" }, { status: 400 });
  }
}

