import { NextRequest, NextResponse } from "next/server";
import { addPendingQuestionFromSales } from "@/lib/excel-store/store";
import { readSalesSession, readSession } from "@/lib/auth/session";
import { insertUsageEvent } from "@/lib/bq/usage-events";

export async function POST(request: NextRequest) {
  const session = (await readSalesSession()) ?? (await readSession());
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    city?: string;
    agentName?: string;
  };

  const question = (body.question ?? "").trim();
  const city = (body.city ?? "").trim();
  const agentName = (body.agentName ?? "").trim();

  if (!question) {
    return NextResponse.json({ error: "缺少問題內容" }, { status: 400 });
  }
  if (!city || !agentName) {
    return NextResponse.json({ error: "缺少縣市或業代資訊" }, { status: 400 });
  }

  const pending = addPendingQuestionFromSales({ question, city, agentName });
  await insertUsageEvent({
    userId: session.userId,
    username: agentName,
    branch: city,
    assistantType: "sales",
    questionKind: "new",
    question,
    replySummary: "",
    inQuestionBank: false,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    message: "已加入待新增題庫清單，並自動進入問題流程追蹤。",
    request: {
      id: `req_${Date.now()}`,
      question,
      city,
      agentName,
      requestedAt: new Date().toISOString(),
    },
    clarificationQuestionId: pending.id,
  });
}
