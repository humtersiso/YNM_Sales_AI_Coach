import type { CitationCard } from "@/lib/gemini/citation-display";
export type { CitationCard } from "@/lib/gemini/citation-display";
export { CITATION_EXCERPT_PREVIEW_CHARS } from "@/lib/gemini/citation-display";
import { scriptCitationsToCards } from "@/lib/gemini/citation-card";
import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { enrichCitations } from "@/lib/gemini/citation-labels";

export type PreparedCitationResult = {
  cards: CitationCard[];
  /** 超過顯示上限的引用筆數（UI 顯示 +N） */
  overflowCount: number;
};

/** 引用標題 → 來源檔名／素材名 */
export function citationSourceTitle(question: string): string {
  const q = question.trim();
  const pdf = q.match(/([^/\\]+\.pdf)/i)?.[1];
  if (pdf) return pdf.replace(/\.pdf$/i, "");
  const parts = q.split("·").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1]!;
  return q.slice(0, 120);
}

function excerptDedupeKey(c: CitationCard): string {
  return `${c.title.toLowerCase()}::${c.excerpt.slice(0, 80)}`;
}

function displayMaxCount(): number {
  const raw = (process.env.SALES_CHAT_MAX_CITATIONS ?? "").trim();
  const envMax = Number(raw);
  if (!Number.isNaN(envMax) && envMax > 0) return Math.min(envMax, 8);

  const ragDefault =
    (process.env.SALES_KNOWLEDGE_BACKEND ?? "rag").trim().toLowerCase() !== "bq"
      ? Number(process.env.RAG_CITATION_DISPLAY_MAX ?? "5")
      : 0;
  if (ragDefault > 0) return Math.min(ragDefault, 8);
  return 5;
}

/** 與前端 citation 卡片一致的 Doc 上限（prompt / sanitize 必用此數，勿用原始 chunks 數） */
export function visibleCitationDocCount(citations: ScriptCitation[]): number {
  return prepareCitationCards(citations).cards.length;
}

/** 回傳給前端：完整 title / page / excerpt，供卡片與 [id] 對照 */
export function prepareCitationCards(citations: ScriptCitation[]): PreparedCitationResult {
  const enriched = enrichCitations(citations);
  const cards = scriptCitationsToCards(enriched);

  const seen = new Set<string>();
  const unique: CitationCard[] = [];
  for (const card of cards) {
    const key = excerptDedupeKey(card);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }

  const max = displayMaxCount();
  const overflowCount = Math.max(0, unique.length - max);
  const visible = unique.slice(0, max).map((c, i) => ({ ...c, id: i + 1 }));

  return { cards: visible, overflowCount };
}

export function dedupeCitations(citations: ScriptCitation[]): ScriptCitation[] {
  const seen = new Set<string>();
  const out: ScriptCitation[] = [];

  for (const c of citations) {
    const key = citationSourceTitle(c.question).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }

  return out.map((c, i) => ({ ...c, index: i + 1 }));
}

/** @deprecated 請改用 prepareCitationCards */
export function prepareDisplayCitations(citations: ScriptCitation[]): ScriptCitation[] {
  return prepareCitationCards(citations).cards.map((c) => ({
    index: c.id,
    question: c.title,
    script: "",
    page: c.page,
    sourceLabel: "來源標題",
  }));
}
