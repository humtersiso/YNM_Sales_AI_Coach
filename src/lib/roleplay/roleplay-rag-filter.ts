import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";
import {
  filterFactsForSession,
  getMentionedCompetitors,
  getOtherCompetitorMentions,
  mentionsSessionCompetitor,
  normalizeCompetitorToken,
} from "@/lib/roleplay/engine/correction-guide";

function hitBlob(h: RagChunkHit): string {
  return `${h.title ?? ""}\n${h.snippet ?? ""}\n${h.sourceFileName ?? ""}`;
}

/** 本場競品須出現在檢索 chunk 中（避免僅靠本品 Q&A 通過覆蓋檢查） */
export const MIN_COMPETITOR_RAG_HITS = 1;

/** 僅看來源標題／檔名（對戰 PDF 檔名），不看內文以免 Q&A 提到 CR-V 誤判 */
export function competitorInSourceMeta(
  hit: RagChunkHit,
  sessionCompetitor: string,
): boolean {
  const meta = `${hit.title ?? ""}\n${hit.sourceFileName ?? ""}`;
  return mentionsSessionCompetitor(meta, sessionCompetitor);
}

/** 舊版：全文比對（含 snippet，易誤判） */
export function countCompetitorRagHits(
  hits: RagChunkHit[],
  sessionCompetitor: string,
): number {
  return hits.filter((h) => mentionsSessionCompetitor(hitBlob(h), sessionCompetitor)).length;
}

/** 競品對戰教材：須為 competitor_compare 且標題／檔名含本場競品 */
export function countCompetitorBattleHits(
  hits: RagChunkHit[],
  sessionCompetitor: string,
): number {
  return hits.filter(
    (h) =>
      h.materialCategory === "competitor_compare" &&
      competitorInSourceMeta(h, sessionCompetitor),
  ).length;
}

/** 開局 RAG：排除主要描述非本場競品的 chunk（上游 metadata 未就緒時的檢索後隔離） */
export function filterRoleplayRagHits(
  hits: RagChunkHit[],
  sessionCompetitor: string,
): RagChunkHit[] {
  const shortComp = normalizeCompetitorToken(sessionCompetitor);
  const allowed = new Set([sessionCompetitor, shortComp]);

  const sessionHits = hits.filter((h) => mentionsSessionCompetitor(hitBlob(h), sessionCompetitor));
  const neutralHits = hits.filter((h) => {
    const blob = hitBlob(h);
    if (mentionsSessionCompetitor(blob, sessionCompetitor)) return false;
    return getOtherCompetitorMentions(blob, sessionCompetitor).length === 0;
  });

  const merged = [...sessionHits, ...neutralHits];
  const deduped = new Map<string, RagChunkHit>();
  for (const h of merged) {
    const key = `${h.title ?? ""}|${(h.snippet ?? "").slice(0, 96)}`;
    const prev = deduped.get(key);
    if (!prev || (h.relevance ?? 0) > (prev.relevance ?? 0)) deduped.set(key, h);
  }
  return [...deduped.values()].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
}

export function splitScenarioFactsForSession(
  facts: { label: string; value: string }[],
  sessionCompetitor: string,
): {
  facts: { label: string; value: string }[];
  coreFacts: { label: string; value: string }[];
  competitorFacts: { label: string; value: string }[];
} {
  const filtered = filterFactsForSession(facts, sessionCompetitor);
  const coreFacts = filtered.filter(
    (f) => !getMentionedCompetitors(`${f.label} ${f.value}`).length,
  );
  const competitorFacts = filtered.filter((f) =>
    mentionsSessionCompetitor(`${f.label} ${f.value}`, sessionCompetitor),
  );
  return { facts: filtered, coreFacts, competitorFacts };
}
