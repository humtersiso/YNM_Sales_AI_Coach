import { NextRequest, NextResponse } from "next/server";
import { chatWithDataAgent } from "@/lib/gemini/conversational-analytics";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    sessionId?: string;
  };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "請輸入問題" }, { status: 400 });
  }

  void body.sessionId;
  const result = await chatWithDataAgent(message);
  return NextResponse.json({
    reply: result.reply,
    citations: result.citations,
    inQuestionBank: result.inQuestionBank,
  });
}
