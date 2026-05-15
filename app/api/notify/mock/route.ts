import { NextRequest, NextResponse } from "next/server";
import { createNotifications, ensureStoreLoaded } from "@/lib/excel-store/store";
import { deliverNotifyEmails } from "@/lib/notify-delivery";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    questionId: string;
    expertIds: string[];
  };

  if (!body.questionId || !body.expertIds?.length) {
    return NextResponse.json({ error: "缺少通知資料" }, { status: 400 });
  }

  const s = ensureStoreLoaded();
  const q = s.questions.find((x) => x.id === body.questionId);
  const experts = s.experts.filter((e) => body.expertIds.includes(e.id));
  const origin = request.headers.get("origin") ?? request.headers.get("referer") ?? "";
  const clarifyPath = origin ? `${origin.replace(/\/$/, "")}/` : "（請以實際站台網址開啟釐清頁）";

  const delivery = await deliverNotifyEmails({
    recipients: experts.map((e) => ({ email: e.email, name: e.name })),
    subject: q
      ? `【話術演練】請協助回覆：${q.originalText.slice(0, 36)}${q.originalText.length > 36 ? "…" : ""}`
      : "【話術演練】請協助回覆釐清題目",
    text: [
      q ? `題目：${q.originalText}` : `題目 ID：${body.questionId}`,
      "",
      `請至平台步驟 4 填寫專家建議，或後續改為信內連結一鍵回寫。`,
      `工作台參考：${clarifyPath}`,
    ].join("\n"),
  });

  const notifications = createNotifications(body.questionId, body.expertIds, delivery.summaryMessage);

  return NextResponse.json({ notifications, deliveryMode: delivery.mode });
}
