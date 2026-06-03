import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { extractFileHints } from "../src/lib/gemini/knowledge-search";
import { extractMentionedCompetitor } from "../src/lib/gemini/sales-question-profile";
import { augmentSpecQueryForSearch } from "../src/lib/gemini/spec-query-expand";
import { searchVertexRagCorpus } from "../src/lib/rag/vertex-rag-search";
import { blobContainsTerm } from "../src/lib/gemini/han-fold";
import { ragHitsToScoredKnowledgeHits } from "../src/lib/rag/rag-to-citations";
import { rerankKnowledgeHits } from "../src/lib/gemini/knowledge-rerank";
import { prioritizeHitsForQuestion } from "../src/lib/gemini/citation-prioritize";
import { refineRagHitsForDisplay } from "../src/lib/rag/rag-citation-pipeline";
import { getPreferredMaterialCategory } from "../src/lib/knowledge/search-scope";
import { getRagCorpusForCategory } from "../src/lib/rag/rag-engine-config";
import type { RagChunkHit } from "../src/lib/rag/discovery-engine-search";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

function buildSearchQuery(message: string, plan: { extraFileHints?: string[] }) {
  let q = augmentSpecQueryForSearch(message);
  const parts = new Set<string>();
  for (const h of [...(plan.extraFileHints ?? []), ...extractFileHints(message)]) parts.add(h);
  const competitor = extractMentionedCompetitor(message);
  if (competitor) parts.add(competitor);
  if (parts.size === 0) return q.trim();
  return `${[...parts].slice(0, 8).join(" ")} ${q}`.trim();
}

async function main() {
  const q = "XFORCE 跟 X-TRAIL 比較";
  const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
  const query = buildSearchQuery(q, plan);
  const topK = 8;
  const perStore = 4;

  const cats = ["competitor_compare", "sales_script", "product_info"] as const;
  const lists: RagChunkHit[][] = [];
  for (const cat of cats) {
    const corpus = getRagCorpusForCategory(cat);
    const hits = await searchVertexRagCorpus(corpus!.ragCorpusResource, query, cat, perStore);
    lists.push(hits);
    const xf = hits.filter((h) => blobContainsTerm(`${h.title}\n${h.snippet}`, "XFORCE")).length;
    console.log(cat, "hits", hits.length, "xforce", xf);
  }

  const merged = lists.flat();
  const xfMerged = merged.filter((h) => blobContainsTerm(`${h.title}\n${h.snippet}`, "XFORCE"));
  console.log("merged xforce:", xfMerged.length);

  const scored = ragHitsToScoredKnowledgeHits(merged);
  const preferred = getPreferredMaterialCategory(plan.scope);
  let reranked = rerankKnowledgeHits(q, scored, plan.scope, preferred);
  reranked = prioritizeHitsForQuestion(q, reranked);

  const head = reranked.slice(0, topK);
  const inHead = head.some((s) =>
    blobContainsTerm(`${s.customer_question ?? ""}\n${s.standard_script ?? ""}\n${s.title ?? ""}`, "XFORCE"),
  );
  console.log("xforce in rerank head:", inHead);

  const finalHits = reranked.slice(0, topK).map((s) => ({
    title: s.customer_question ?? s.title ?? "",
    snippet: s.standard_script ?? "",
    materialCategory: s.material_category ?? "general",
    relevance: s.bqRelevance,
    uri: s.source_locator?.trim() || undefined,
  }));

  const inFinal = finalHits.some((h) => blobContainsTerm(`${h.title}\n${h.snippet}`, "XFORCE"));
  console.log("xforce in finalHits:", inFinal, "finalHits len:", finalHits.length);
  if (finalHits[0]) console.log("  top final:", finalHits[0].title.slice(0, 60));

  let hitsForRefine = finalHits;
  const mentioned = extractMentionedCompetitor(q);
  if (mentioned && !inFinal) {
    const fromMerged = merged.filter((h) => blobContainsTerm(`${h.title}\n${h.snippet}`, mentioned));
    console.log("fallback fromMerged:", fromMerged.length);
    if (fromMerged.length > 0) hitsForRefine = fromMerged.slice(0, Math.max(topK, 8));
  }

  const display = refineRagHitsForDisplay(q, hitsForRefine, profile);
  console.log("display:", display.length, display[0]?.title?.slice(0, 80));
}

main().catch(console.error);
