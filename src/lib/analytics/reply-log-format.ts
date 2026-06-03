import type { ScriptCitation } from "@/lib/gemini/reply-format";

const MAX_LEN = 6000;

/** 後台問題紀錄：合併 intro、列點、引用來源為單段文字 */
export function formatSalesReplyForUsageLog(input: {
  reply: string;
  bullets?: string[];
  citations?: Pick<ScriptCitation, "question">[];
}): string {
  const parts: string[] = [];
  const intro = input.reply.trim();
  if (intro) parts.push(intro);

  for (const b of input.bullets ?? []) {
    const t = b.trim();
    if (t) parts.push(`• ${t}`);
  }

  const cites = (input.citations ?? [])
    .map((c) => c.question.trim())
    .filter(Boolean);
  if (cites.length > 0) {
    parts.push(`[引用] ${cites.join("、")}`);
  }

  const out = parts.join("\n");
  if (out.length <= MAX_LEN) return out;
  return `${out.slice(0, MAX_LEN - 1)}…`;
}
