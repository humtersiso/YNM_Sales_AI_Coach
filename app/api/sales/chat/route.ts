import { NextRequest, NextResponse } from "next/server";
import { chatWithDataAgent } from "@/lib/gemini/conversational-analytics";
import { getDefaultSalesProductLine } from "@/lib/knowledge/search-scope";
import { readAssistantApiUser } from "@/lib/auth/api-auth";
import { formatSalesReplyForUsageLog } from "@/lib/analytics/reply-log-format";
import { insertUsageEvent } from "@/lib/bq/usage-events";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { normalizeMaterialCategory } from "@/lib/ingest/contracts/material-category-contract";

export async function POST(request: NextRequest) {
  const session = await readAssistantApiUser();
  if (!session) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    productLine?: string;
    materialCategory?: string;
  };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "請輸入問題" }, { status: 400 });
  }

  const productLine = (body.productLine ?? "").trim() || getDefaultSalesProductLine();
  const rawCategory = (body.materialCategory ?? "").trim();
  const materialCategory = rawCategory
    ? normalizeMaterialCategory(rawCategory)
    : null;

  const result = await chatWithDataAgent(message, {
    productLine,
    materialCategory: materialCategory as MaterialCategory | null,
  });
  await insertUsageEvent({
    userId: session.userId,
    username: session.displayName || session.username,
    branch: session.branch ?? "",
    assistantType: "sales",
    questionKind: "bank",
    question: message,
    replySummary: formatSalesReplyForUsageLog(result),
    inQuestionBank: result.inQuestionBank,
  }).catch(() => null);
  return NextResponse.json({
    reply: result.reply,
    bullets: result.bullets,
    citations: result.citations,
    inQuestionBank: result.inQuestionBank,
    allowAddRequest: result.allowAddRequest ?? false,
    question: result.question,
  });
}
