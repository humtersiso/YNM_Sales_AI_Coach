import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { searchKnowledgeByPlanRag } from "../src/lib/gemini/knowledge-search-rag";
import { searchVertexRagCorpus } from "../src/lib/rag/vertex-rag-search";
import { ragHitsToScoredKnowledgeHits } from "../src/lib/rag/rag-to-citations";
import { rerankKnowledgeHits } from "../src/lib/gemini/knowledge-rerank";
import { prioritizeHitsForQuestion } from "../src/lib/gemini/citation-prioritize";
import { refineRagHitsForDisplay, prepareRagHitForDisplay } from "../src/lib/rag/rag-citation-pipeline";
import { blobContainsTerm } from "../src/lib/gemini/han-fold";
import { extractMentionedCompetitor } from "../src/lib/gemini/sales-question-profile";
import { getPreferredMaterialCategory } from "../src/lib/knowledge/search-scope";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

async function main() {
  const q = "XFORCE 跟 X-TRAIL 比較";
  const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
  console.log("comp:", extractMentionedCompetitor(q), "profile:", profile.category);

  const compHits = await searchVertexRagCorpus(
    process.env.RAG_CORPUS_COMPETITOR ?? "",
    `${extractMentionedCompetitor(q)} ${q}`,
    "competitor_compare",
    8,
  );
  const xf = compHits.filter((h) => blobContainsTerm(`${h.title}\n${h.snippet}`, "XFORCE"));
  console.log("\nraw xforce hits:", xf.length);
  xf.forEach((h, i) => {
    console.log(`  [${i}] title:`, h.title.slice(0, 80));
    console.log("      snippet:", h.snippet.slice(0, 120));
    const prep = prepareRagHitForDisplay(q, h);
    console.log("      prepared:", prep ? "OK" : "NULL", prep?.title?.slice(0, 60));
  });

  const scored = ragHitsToScoredKnowledgeHits(compHits);
  const preferred = getPreferredMaterialCategory(plan.scope);
  let reranked = rerankKnowledgeHits(q, scored, plan.scope, preferred);
  reranked = prioritizeHitsForQuestion(q, reranked);
  console.log("\nreranked top 5:");
  reranked.slice(0, 5).forEach((s, i) => {
    const blob = `${s.customer_question ?? ""}\n${s.standard_script ?? ""}\n${s.title ?? ""}`;
    console.log(`  [${i}] xf=${blobContainsTerm(blob, "XFORCE")} ${(s.title ?? s.customer_question ?? "").slice(0, 70)}`);
  });

  const finalHits = reranked.slice(0, 8).map((s) => ({
    title: s.customer_question ?? s.title ?? "",
    snippet: s.standard_script ?? "",
    materialCategory: s.material_category ?? "competitor_compare",
    relevance: s.bqRelevance,
    uri: s.source_locator?.trim() || undefined,
  }));

  const fromMerged = compHits.filter((h) => blobContainsTerm(`${h.title}\n${h.snippet}`, "XFORCE"));
  console.log("\nrefine fromMerged:", fromMerged.length);
  const display = refineRagHitsForDisplay(q, fromMerged, profile);
  console.log("refine out:", display.length, display[0]?.title?.slice(0, 80));

  const cites = await searchKnowledgeByPlanRag(q, plan, profile);
  console.log("\nfinal citations:", cites.length);
}

main().catch(console.error);
