import { parseCitationSourceParts } from "@/lib/gemini/citation-card";
import { citationDisplayTitle, hitsToCitations } from "@/lib/gemini/knowledge-search";
import type { ScoredKnowledgeHit } from "@/lib/gemini/knowledge-search";
import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { MATERIAL_CATEGORY_LABELS } from "@/lib/ingest/contracts/material-category-contract";
import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";
import { extractCustomerQuestionFromRagSnippet, stripRagBoilerplate } from "@/lib/rag/rag-citation-format";

const EXCERPT_MAX = Number(process.env.RAG_CITATION_EXCERPT_MAX ?? "2400") || 2400;

export function ragHitsToScoredKnowledgeHits(hits: RagChunkHit[]): ScoredKnowledgeHit[] {
  return hits.map((h) => {
    const cq = extractCustomerQuestionFromRagSnippet(h.snippet) ?? h.title;
    return {
      customer_question: cq,
      title: h.title,
      standard_script: stripRagBoilerplate(h.snippet),
      material_category: h.materialCategory,
      product_line: h.productLine ?? "_common",
      source_locator: h.uri ?? h.title,
      source_kind: "rag",
      bqRelevance: h.relevance,
    };
  });
}

export function ragHitsToCitations(hits: RagChunkHit[], _userMessage = ""): ScriptCitation[] {
  const scored = ragHitsToScoredKnowledgeHits(hits);
  const citations = hitsToCitations(scored);
  const byTitle = new Map(hits.map((h) => [h.title, h]));
  return citations.map((c) => {
    const hit = byTitle.get(c.question) ?? hits.find((h) => h.snippet === c.script);
    if (!hit) return c;
    const label = MATERIAL_CATEGORY_LABELS[hit.materialCategory];
    const displayScript = stripRagBoilerplate(hit.snippet).slice(0, EXCERPT_MAX);
    const parsed = parseCitationSourceParts(hit.title, hit.pageLabel);
    return {
      ...c,
      script: displayScript || c.script,
      question: citationDisplayTitle({
        customer_question: hit.title,
        title: hit.title,
        standard_script: hit.snippet,
        material_category: hit.materialCategory,
        product_line: hit.productLine ?? "_common",
        source_locator: hit.uri ?? "",
        bqRelevance: hit.relevance,
      } as ScoredKnowledgeHit),
      page: hit.pageLabel ?? parsed.page,
      sourceLabel: `${label}（RAG）`,
      scriptLabel: hit.uri ? "向量檢索摘錄" : "摘錄",
      materialCategory: hit.materialCategory,
    };
  });
}
