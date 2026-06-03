import { NextRequest } from "next/server";
import { readSalesSession, readSession } from "@/lib/auth/session";
import { formatSalesReplyForUsageLog } from "@/lib/analytics/reply-log-format";
import { insertUsageEvent } from "@/lib/bq/usage-events";
import type { SalesChatResult } from "@/lib/gemini/sales-chat-types";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { normalizeMaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { streamSalesChat } from "@/lib/gemini/conversational-analytics";
import { getDefaultSalesProductLine } from "@/lib/knowledge/search-scope";

export const runtime = "nodejs";

function ndjson(obj: unknown): string {
  return `${JSON.stringify(obj)}\n`;
}

export async function POST(request: NextRequest) {
  const session = (await readSalesSession()) ?? (await readSession());
  if (!session) {
    return new Response(ndjson({ type: "error", message: "未登入" }), { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    productLine?: string;
    materialCategory?: string;
  };
  const message = (body.message ?? "").trim();
  if (!message) {
    return new Response(ndjson({ type: "error", message: "請輸入問題" }), { status: 400 });
  }

  const productLine = (body.productLine ?? "").trim() || getDefaultSalesProductLine();
  const rawCategory = (body.materialCategory ?? "").trim();
  const materialCategory = rawCategory
    ? normalizeMaterialCategory(rawCategory)
    : null;

  const scope = {
    productLine,
    materialCategory: materialCategory as MaterialCategory | null,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const push = (obj: unknown) => controller.enqueue(encoder.encode(ndjson(obj)));

      try {
        let finalResult: SalesChatResult | null = null;
        for await (const event of streamSalesChat(message, scope)) {
          push(event);
          if (event.type === "done") finalResult = event.result;
        }

        await insertUsageEvent({
          userId: session.userId,
          username: session.displayName || session.username,
          branch: session.branch ?? "",
          assistantType: "sales",
          questionKind: "bank",
          question: message,
          replySummary: finalResult
            ? formatSalesReplyForUsageLog(finalResult)
            : "",
          inQuestionBank: finalResult?.inQuestionBank ?? true,
        }).catch(() => null);
      } catch (e) {
        console.error("sales chat stream failed", e);
        push({ type: "error", message: "查詢失敗，請稍後再試" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
