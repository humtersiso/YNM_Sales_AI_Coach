import { NextRequest, NextResponse } from "next/server";
import { findBestDuplicate } from "@/lib/duplicate/checker";
import {
  ensureStoreLoaded,
  listDuplicateQuestionsForCheck,
  runIncomingDuplicateCheck,
} from "@/lib/excel-store/store";

type InputPayload = {
  items: Array<{ text: string; source?: string }>;
};

/**
 * 僅比對是否與目前記憶體中的知識庫（duplicate）重複，**不新增題目**。
 * 題庫／新題請透過編輯 Excel 後「自 Excel 載入」更新。
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as InputPayload;
  const items = body.items?.filter((item) => item.text?.trim().length > 0) ?? [];

  if (!items.length) {
    try {
      const result = runIncomingDuplicateCheck();
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "問題檢查失敗" },
        { status: 400 },
      );
    }
  }

  ensureStoreLoaded();
  const existing = listDuplicateQuestionsForCheck();

  const rows = items.map((item, index) => {
    const best = findBestDuplicate(item.text, existing);
    const isDup = Boolean(best);
    return {
      id: `preview-${index}`,
      originalText: item.text.trim(),
      source: item.source?.trim() || "Excel上傳",
      isDuplicate: isDup,
      suggestedReply: isDup ? best!.suggestedReply : "（未命中知識庫重複題；若需納入題庫請於主 Excel 新增後載入）",
      duplicateScore: best?.score ?? null,
    };
  });

  return NextResponse.json({ items: rows });
}
