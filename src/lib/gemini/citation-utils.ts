import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { enrichCitations } from "@/lib/gemini/citation-labels";

function normQuestion(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 引用標題 → 來源檔名／素材名（UI 只顯示此欄） */
export function citationSourceTitle(question: string): string {
  const q = question.trim();
  const pdf = q.match(/([^/\\]+\.pdf)/i)?.[1];
  if (pdf) return pdf.replace(/\.pdf$/i, "");
  const parts = q.split("·").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1]!;
  return q.slice(0, 120);
}

function sourceKey(c: ScriptCitation): string {
  return citationSourceTitle(c.question).toLowerCase();
}

/** 合併同一來源檔（保留排序最前的一則） */
export function dedupeCitations(citations: ScriptCitation[]): ScriptCitation[] {
  const seen = new Set<string>();
  const out: ScriptCitation[] = [];

  for (const c of citations) {
    const key = sourceKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }

  return out.map((c, i) => ({ ...c, index: i + 1 }));
}

function displayMaxCount(): number {
  const raw = (process.env.SALES_CHAT_MAX_CITATIONS ?? "").trim();
  const envMax = Number(raw);
  if (!Number.isNaN(envMax) && envMax > 0) return Math.min(envMax, 5);

  const ragDefault =
    (process.env.SALES_KNOWLEDGE_BACKEND ?? "rag").trim().toLowerCase() !== "bq"
      ? Number(process.env.RAG_CITATION_DISPLAY_MAX ?? "1")
      : 0;
  if (ragDefault > 0) return Math.min(ragDefault, 5);
  return 1;
}

/** 回傳給前端的引用：僅來源標題，不帶摘錄內文 */
export function prepareDisplayCitations(citations: ScriptCitation[]): ScriptCitation[] {
  const enriched = enrichCitations(citations);
  const titleOnly = enriched.map((c) => ({
    ...c,
    question: citationSourceTitle(c.question),
    script: "",
  }));
  const unique = dedupeCitations(titleOnly);
  const max = displayMaxCount();
  return unique.slice(0, max).map((c, i) => ({ ...c, index: i + 1 }));
}
