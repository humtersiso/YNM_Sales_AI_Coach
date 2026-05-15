import { NextRequest, NextResponse } from "next/server";
import { getLegalReview, updateLegalReview, type LegalChecklistItem } from "@/lib/legal-review-store";
import { setQuestionLegalDecision } from "@/lib/excel-store/store";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "缺少 token" }, { status: 400 });
  }
  const row = getLegalReview(token);
  if (!row) {
    return NextResponse.json({ error: "找不到或已過期" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "缺少 token" }, { status: 400 });
  }

  const body = (await request.json()) as {
    checklist?: LegalChecklistItem[];
    comments?: string;
    decision?: "approved" | "rejected" | "pending_review";
  };

  const next = updateLegalReview(token, {
    checklist: body.checklist,
    comments: body.comments,
  });

  if (!next) {
    return NextResponse.json({ error: "找不到或已過期" }, { status: 410 });
  }
  if (body.decision) {
    setQuestionLegalDecision(next.questionId, body.decision, body.comments);
  }

  return NextResponse.json(next);
}
