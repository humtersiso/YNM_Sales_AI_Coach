import { NextRequest, NextResponse } from "next/server";
import { ensureStoreLoaded } from "@/lib/excel-store/store";
import { deliverNotifyEmails } from "@/lib/notify-delivery";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { questionId?: string };
  if (!body.questionId) {
    return NextResponse.json({ error: "缺少 questionId" }, { status: 400 });
  }

  const s = ensureStoreLoaded();
  const q = s.questions.find((x) => x.id === body.questionId);
  if (!q) {
    return NextResponse.json({ error: "找不到題目" }, { status: 404 });
  }

  const recipientsRaw = process.env.LEGAL_REVIEW_EMAILS?.trim() || "legal@example.com";
  const recipients = recipientsRaw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((email, idx) => ({ email, name: `法務${idx + 1}` }));

  const createRes = await fetch(new URL("/api/legal-review/create", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId: q.id }),
  });
  const createJson = await createRes.json().catch(() => ({}));
  if (!createRes.ok) {
    return NextResponse.json(
      { error: (createJson as { error?: string }).error ?? "建立法務連結失敗" },
      { status: 500 },
    );
  }
  const urlPath = (createJson as { urlPath?: string }).urlPath ?? "";
  const fullUrl = `${request.nextUrl.origin}${urlPath}`;

  const delivery = await deliverNotifyEmails({
    recipients,
    subject: `【法務審查】請審查題目：${q.originalText.slice(0, 30)}${q.originalText.length > 30 ? "…" : ""}`,
    text: [`題目：${q.originalText}`, "", `法務審查連結：${fullUrl}`].join("\n"),
  });

  return NextResponse.json({
    ok: true,
    message: `已建立法務連結並寄送通知（${delivery.mode}）`,
    link: fullUrl,
  });
}

