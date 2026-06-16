import type { CitationCard } from "@/lib/gemini/citation-card";
import { formatSalesReplyAsUiDisplay } from "@/lib/gemini/reply-format";

const MAX_LEN = 6000;

/** 後台問題紀錄：與前端 finalize 後顯示一致（小結 + 列點 + 引用） */
export function formatSalesReplyForUsageLog(input: {
  reply: string;
  bullets?: string[];
  citations?: Pick<CitationCard, "title" | "page">[];
}): string {
  const intro = input.reply.trim();
  const bullets = (input.bullets ?? []).map((b) => b.trim()).filter(Boolean);
  const parts: string[] = [];

  if (intro || bullets.length > 0) {
    parts.push(formatSalesReplyAsUiDisplay(intro, bullets));
  }

  const cites = (input.citations ?? [])
    .map((c) => `${c.title}${c.page && c.page !== "—" ? ` ${c.page}` : ""}`.trim())
    .filter(Boolean);
  if (cites.length > 0) {
    parts.push(`[引用] ${cites.join("、")}`);
  }

  const out = parts.join("\n");
  if (out.length <= MAX_LEN) return out;
  return `${out.slice(0, MAX_LEN - 1)}…`;
}
