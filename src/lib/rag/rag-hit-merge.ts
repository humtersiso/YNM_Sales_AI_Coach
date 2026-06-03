import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";

export function ragHitKey(h: RagChunkHit): string {
  return `${h.materialCategory}::${h.title}::${h.snippet.slice(0, 120)}`;
}

/** Reciprocal Rank Fusion：合併多通道 RAG 命中 */
export function mergeRagHitsByRrf(lists: RagChunkHit[][], k = 60): RagChunkHit[] {
  const scores = new Map<string, { hit: RagChunkHit; score: number }>();

  for (const list of lists) {
    list.forEach((hit, rank) => {
      const key = ragHitKey(hit);
      const rrf = 1 / (k + rank + 1);
      const prev = scores.get(key);
      if (prev) {
        prev.score += rrf;
        if ((hit.relevance ?? 0) > (prev.hit.relevance ?? 0)) prev.hit = hit;
      } else {
        scores.set(key, { hit, score: rrf });
      }
    });
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ hit, score }) => ({
      ...hit,
      relevance: (hit.relevance ?? 50) + score * 100,
    }));
}
