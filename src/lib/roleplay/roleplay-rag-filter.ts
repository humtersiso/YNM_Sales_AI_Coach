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
