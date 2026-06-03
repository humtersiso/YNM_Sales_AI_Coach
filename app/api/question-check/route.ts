import { NextRequest, NextResponse } from "next/server";
import { findBestDuplicate } from "@/lib/duplicate/checker";
import { getKnowledgeBaseForDuplicateCheck } from "@/lib/bq/script-drills-query";
import { runIncomingDuplicateCheck } from "@/lib/excel-store/store";

type InputPayload = {
  items: Array<{ text: string; source?: string }>;
};

/**
 * 比對是否與題庫（BigQuery 話術表）重複。
 * 非重複者寫入問題流程追蹤（待釐清）。
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as InputPayload;
  const items = body.items?.filter((item) => item.text?.trim().length > 0) ?? [];

  if (!items.length) {
    try {
      const existing = await getKnowledgeBaseForDuplicateCheck();
      const result = runIncomingDuplicateCheck(existing);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "問題檢查失敗" },
        { status: 400 },
      );
    }
  }

  const existing = await getKnowledgeBaseForDuplicateCheck();

  const rows = items.map((item, index) => {
    const best = findBestDuplicate(item.text, existing);
    const isDup = Boolean(best);
    return {
      id: `preview-${index}`,
      originalText: item.text.trim(),
      source: item.source?.trim() || "Excel上傳",
      isDuplicate: isDup,
      suggestedReply: isDup
        ? best!.suggestedReply
        : "（未命中知識庫重複題；將進入問題流程追蹤）",
      duplicateScore: best?.score ?? null,
    };
  });

  return NextResponse.json({ items: rows });
}
