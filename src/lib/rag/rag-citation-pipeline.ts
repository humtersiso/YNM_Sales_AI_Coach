/**
 * RAG 引用唯一入口：chunk → 去雜訊 → 依類型抽摘錄 → 排序 → 輸出 UI。
 *
 * 根源說明：PDF/PPT 在 RAG 匯入時常是整頁 chunk；顯示層必須結構化摘錄，
 * 而非把 raw chunk 直接給前端。長期建議在匯入時做 chunk 清洗與較小段落切分。
 */
import { questionSimilarity } from "@/lib/analytics/question-dedup";
import { extractSearchKeywords } from "@/lib/gemini/knowledge-search";
import { extractMentionedCompetitor } from "@/lib/gemini/sales-question-profile";
import type { SalesQuestionProfile } from "@/lib/gemini/sales-question-profile";
import { isSpecNumericQuery } from "@/lib/gemini/spec-query-expand";
import { blobContainsTerm } from "@/lib/gemini/han-fold";
import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";
import {
  extractCustomerQuestionFromRagSnippet,
  pdfNameFromHit,
  stripRagBoilerplate,
} from "@/lib/rag/rag-citation-format";

const TABLE_DUMP = /客戶疑問\s*[\(（]?問|提供DLR\s*興趣車/i;
const QA_ROW_CODE = /(?:^|\s)([A-Z]{2}\s+X-TRAIL)/g;
const DISPLAY_EXCERPT_MAX = Number(process.env.RAG_CITATION_EXCERPT_MAX ?? "360") || 360;

export type RagChunkKind = "qa_table" | "qa_oral" | "document";

function loose(s: string): string {
  return s
    .replace(/[\s?？！!，,。.、；;：:""''「」【】()（）\[\]\-]/g, "")
    .toLowerCase();
}

function queryNeedles(message: string): string[] {
  const t = message.trim();
  const n = loose(t);
  const out = new Set<string>();
  if (t.length >= 6) out.add(t);
  for (let len = Math.min(n.length, 28); len >= 6; len -= 2) {
    for (let i = 0; i <= n.length - len; i++) {
      out.add(n.slice(i, i + len));
    }
  }
  return [...out].sort((a, b) => b.length - a.length).slice(0, 24);
}

function detectChunkKind(snippet: string): RagChunkKind {
  if (TABLE_DUMP.test(snippet) || (snippet.length > 600 && /X-TRAIL\s+輕油電/.test(snippet))) {
    return "qa_table";
  }
  const oral = extractCustomerQuestionFromRagSnippet(snippet);
  if (oral && /[？?]/.test(oral)) return "qa_oral";
  return "document";
}

function splitQaTableRows(snippet: string): Array<{ text: string }> {
  const matches = [...snippet.matchAll(QA_ROW_CODE)];
  if (matches.length === 0) return [{ text: snippet }];
  const rows: Array<{ text: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = m.index! + (m[0].startsWith(" ") ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : snippet.length;
    rows.push({ text: snippet.slice(start, end) });
  }
  return rows;
}

function scoreRowToQuery(message: string, rowText: string, needles: string[]): number {
  const hay = loose(rowText);
  let score = 0;
  for (const needle of needles) {
    const n = loose(needle);
    if (n.length >= 6 && hay.includes(n)) score += n.length;
  }
  return score;
}

function extractOralQuestion(text: string): string | null {
  const m = text.match(
    /((?:為什麼|為何|是不是|會不會|有沒有|怎麼|如何|請問|你們|我|這|那)[^?？\n]{4,100}[?？])/,
  );
  return m?.[1]?.trim() ?? null;
}

function extractQaPairFromSnippet(snippet: string, oralQ: string): string {
  const afterQ = snippet.slice(snippet.indexOf(oralQ) + oralQ.length);
  const ansMatch = afterQ.match(/(?:[\(（]答[\)）]|針對[^。\n]{0,40})[^。\n]{8,600}。/);
  const body = ansMatch ? `${oralQ}\n${ansMatch[0].trim()}` : oralQ;
  return stripRagBoilerplate(body).slice(0, DISPLAY_EXCERPT_MAX);
}

function excerptFromQaTable(message: string, snippet: string): string | null {
  const needles = queryNeedles(message);
  const rows = splitQaTableRows(snippet);
  let best: { text: string; score: number } | null = null;
  for (const row of rows) {
    const score = scoreRowToQuery(message, row.text, needles);
    if (score > (best?.score ?? 0)) best = { text: row.text, score };
  }
  if (!best || best.score < 12) return null;

  const oralQ = extractOralQuestion(best.text);
  if (!oralQ) return stripRagBoilerplate(best.text).slice(0, DISPLAY_EXCERPT_MAX);

  return extractQaPairFromSnippet(best.text, oralQ);
}

function excerptFromDocument(message: string, snippet: string): string {
  const cleaned = stripRagBoilerplate(snippet);
  const terms = [
    ...extractSearchKeywords(message),
    extractMentionedCompetitor(message) ?? "",
  ].filter((t) => t.length >= 2);

  let bestIdx = -1;
  let bestTerm = "";
  const hay = cleaned.toLowerCase();
  for (const term of terms) {
    const idx = hay.indexOf(term.toLowerCase());
    if (idx >= 0 && term.length >= bestTerm.length) {
      bestIdx = idx;
      bestTerm = term;
    }
  }

  if (bestIdx >= 0) {
    const start = Math.max(0, bestIdx - 72);
    const end = Math.min(cleaned.length, bestIdx + bestTerm.length + DISPLAY_EXCERPT_MAX - 96);
    let slice = cleaned.slice(start, end).trim();
    if (slice.length > DISPLAY_EXCERPT_MAX) slice = `${slice.slice(0, DISPLAY_EXCERPT_MAX - 1)}…`;
    return slice;
  }

  return cleaned.slice(0, DISPLAY_EXCERPT_MAX).trim();
}

function buildDisplayTitle(message: string, hit: RagChunkHit, excerpt: string, kind: RagChunkKind): string {
  const pdf = pdfNameFromHit(hit).replace(/\.pdf$/i, "");
  const oral =
    extractCustomerQuestionFromRagSnippet(excerpt) ??
    extractOralQuestion(excerpt) ??
    (kind !== "document" ? message.trim().slice(0, 80) : null);
  if (oral && oral.length >= 6) return `${oral.slice(0, 80)} · ${pdf}`;
  return pdf;
}

/** 單一 chunk → 可顯示的引用 hit（已去 Confidential、已抽摘錄） */
export function prepareRagHitForDisplay(message: string, hit: RagChunkHit): RagChunkHit | null {
  const raw = stripRagBoilerplate(hit.snippet);
  if (!raw || raw.length < 8) return null;

  const kind = detectChunkKind(hit.snippet);
  let excerpt: string | null = null;
  if (kind === "qa_table") excerpt = excerptFromQaTable(message, hit.snippet);
  else if (kind === "qa_oral") {
    const oral =
      extractCustomerQuestionFromRagSnippet(raw) ?? extractOralQuestion(raw) ?? extractOralQuestion(hit.snippet);
    excerpt = oral ? extractQaPairFromSnippet(hit.snippet, oral) : excerptFromDocument(message, hit.snippet);
  } else {
    excerpt = excerptFromDocument(message, hit.snippet);
  }
  if (!excerpt) return null;
  if (isQuestionOnlyExcerpt(excerpt)) return null;

  return {
    ...hit,
    title: buildDisplayTitle(message, hit, excerpt, kind),
    snippet: excerpt,
    relevance: hit.relevance,
  };
}

function isQuestionOnlyExcerpt(excerpt: string): boolean {
  const t = excerpt.trim();
  return t.length < 140 && /[?？]$/.test(t) && !/針對|[\(（]答/.test(t);
}

function topicMismatchPenalty(message: string, excerpt: string): number {
  let penalty = 0;
  if (/晃|暈車|暈/.test(message)) {
    if (!/晃|吸震|懸吊|韌性|重心/.test(excerpt)) penalty += 50;
    else if (/後座長度|腿部空間|劇院級|空間靈活/.test(excerpt) && !/晃|吸震|懸吊|韌性|重心/.test(excerpt)) {
      penalty += 45;
    }
  }
  return penalty;
}

function scoreDisplayHit(message: string, hit: RagChunkHit): number {
  const sim = Math.max(
    questionSimilarity(message, hit.snippet),
    questionSimilarity(message, hit.title),
  );
  let score = sim * 100 + hit.relevance * 0.2;
  const hay = `${hit.title} ${hit.snippet}`.toLowerCase();
  for (const kw of extractSearchKeywords(message)) {
    if (kw.length >= 3 && hay.includes(kw.toLowerCase())) score += Math.min(kw.length, 10);
  }
  const comp = extractMentionedCompetitor(message);
  if (comp && hay.includes(comp.toLowerCase().replace(/\s+/g, ""))) score += 18;
  if (hay.includes(pdfNameFromHit(hit).toLowerCase().replace(/\.pdf$/, ""))) score += 8;
  if (isQuestionOnlyExcerpt(hit.snippet)) score -= 35;
  score -= topicMismatchPenalty(message, hit.snippet);
  return score;
}

function displayCitationMax(profile?: SalesQuestionProfile): number {
  const raw = Number(process.env.RAG_CITATION_DISPLAY_MAX ?? "5");
  const envMax = Number.isNaN(raw) || raw <= 0 ? 5 : Math.min(raw, 8);
  if (profile?.category === "sales_qa") {
    const qaRaw = Number(process.env.RAG_SALES_QA_MAX_CITATIONS ?? "1");
    return Number.isNaN(qaRaw) || qaRaw <= 0 ? 1 : Math.min(qaRaw, 3);
  }
  return envMax;
}

function filterByMentionedCompetitor(message: string, hits: RagChunkHit[]): RagChunkHit[] {
  const comp = extractMentionedCompetitor(message);
  if (!comp) return hits;
  const matched = hits.filter((h) => blobContainsTerm(`${h.title}\n${h.snippet}`, comp));
  return matched;
}

function collapseByPdf(hits: RagChunkHit[]): RagChunkHit[] {
  const best = new Map<string, RagChunkHit>();
  for (const h of hits) {
    const key = pdfNameFromHit(h).toLowerCase();
    const prev = best.get(key);
    if (!prev || h.relevance > prev.relevance) best.set(key, h);
  }
  return [...best.values()];
}

/** 檢索後統一精簡引用（唯一出口） */
export function refineRagHitsForDisplay(
  message: string,
  hits: RagChunkHit[],
  profile?: SalesQuestionProfile,
): RagChunkHit[] {
  if (hits.length === 0) return hits;

  const maxOut = displayCitationMax(profile);

  /** 規格題：保留含 ps/kgm/油耗等數字的 chunk，避免 QA 摘錄器把短句問法濾光 */
  if (profile?.category === "spec" || isSpecNumericQuery(message)) {
    const specHits = hits
      .map((h) => {
        const excerpt = stripRagBoilerplate(h.snippet).slice(0, DISPLAY_EXCERPT_MAX);
        if (excerpt.length < 8) return null;
        return {
          ...h,
          title: pdfNameFromHit(h).replace(/\.pdf$/i, ""),
          snippet: excerpt,
        };
      })
      .filter((h): h is RagChunkHit => h != null);
    return collapseByPdf(specHits).slice(0, Math.max(maxOut, 3));
  }

  let prepared = hits
    .map((h) => prepareRagHitForDisplay(message, h))
    .filter((h): h is RagChunkHit => h != null && topicMismatchPenalty(message, h.snippet) < 45)
    .map((h) => ({ h, score: scoreDisplayHit(message, h) }))
    .sort((a, b) => b.score - a.score)
    .map(({ h, score }) => ({ ...h, relevance: Math.max(h.relevance, Math.round(score)) }));

  prepared = filterByMentionedCompetitor(message, prepared);

  const top = prepared[0]?.relevance ?? 0;
  const filtered = prepared.filter((h, i) => i === 0 || h.relevance >= top * 0.55);

  return collapseByPdf(filtered).slice(0, maxOut);
}
