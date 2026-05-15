import { NextRequest, NextResponse } from "next/server";
import { ensureStoreLoaded, setQuestionLegalDecision } from "@/lib/excel-store/store";
import { createLegalReview } from "@/lib/legal-review-store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { questionId?: string };
    if (!body.questionId?.trim()) {
      return NextResponse.json({ error: "缺少 questionId" }, { status: 400 });
    }

    const s = ensureStoreLoaded();
    const q = s.questions.find((x) => x.id === body.questionId);
    if (!q) {
      return NextResponse.json({ error: "找不到題目" }, { status: 404 });
    }

    const script =
      (q.standardScript?.trim() ||
        q.suggestedReply
          ?.split("\n")
          .map((l) => l.trim())
          .filter(Boolean)[0] ||
        "").trim();

    if (!script) {
      return NextResponse.json({ error: "此題尚無可審查的標準話術內容" }, { status: 400 });
    }

    const row = createLegalReview(q.id, q.originalText, script);
    setQuestionLegalDecision(q.id, "pending_review");
    return NextResponse.json({
      token: row.token,
      urlPath: `/legal-review/${row.token}`,
      expiresAt: row.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "建立法務審查失敗" },
      { status: 500 },
    );
  }
}
