import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { prioritizeHitsForQuestion } from "@/lib/gemini/citation-prioritize";
import type { KnowledgeSearchPlan } from "@/lib/gemini/sales-intent-router";
import { extractFileHints } from "@/lib/gemini/knowledge-search";
import {
  augmentSpecQueryForSearch,
  expandSpecSearchTerms,
  isSpecNumericQuery,
} from "@/lib/gemini/spec-query-expand";
import { rerankKnowledgeHits, type RerankedKnowledgeHit } from "@/lib/gemini/knowledge-rerank";
import { blobContainsTerm } from "@/lib/gemini/han-fold";
import type { SalesQuestionProfile } from "@/lib/gemini/sales-question-profile";
import {
  extractMentionedCompetitor,
  salesCategoryToMaterialCategory,
} from "@/lib/gemini/sales-question-profile";
import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { getPreferredMaterialCategory, type KnowledgeSearchScope } from "@/lib/knowledge/search-scope";
import { retrievalResultLimit } from "@/lib/gemini/sales-chat-speed";
import {
  assertRagConfigured,
  getRagCorpusForCategory,
  listConfiguredRagCorpora,
  type RagCorpusConfig,
  useVertexRagEngineApi,
  warnIfRagPartiallyConfigured,
} from "@/lib/rag/rag-engine-config";
import {
  searchDiscoveryEngineDatastore,
  type RagChunkHit,
} from "@/lib/rag/discovery-engine-search";
import { searchVertexRagCorpus } from "@/lib/rag/vertex-rag-search";
import { ragHitsToScoredKnowledgeHits, ragHitsToCitations } from "@/lib/rag/rag-to-citations";
import { refineRagHitsForDisplay } from "@/lib/rag/rag-citation-filter";

function dedupeRagHits(hits: RagChunkHit[]): RagChunkHit[] {
  const seen = new Set<string>();
  const out: RagChunkHit[] = [];
  for (const h of hits) {
    const key = `${h.materialCategory}::${h.title}::${h.snippet.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/** 依問題類型決定要查哪些語料庫（主庫 + 必要時補庫） */
function corporaForPlan(
  plan: KnowledgeSearchPlan,
  profile?: SalesQuestionProfile,
  message = "",
): MaterialCategory[] {
  if (isSpecNumericQuery(message)) {
    return ["competitor_compare", "product_info", "sales_script"];
  }

  const mentionedCompetitor = extractMentionedCompetitor(message);
  if (mentionedCompetitor || profile?.category === "competitor") {
    return ["competitor_compare", "sales_script", "product_info"];
  }

  const preferred =
    getPreferredMaterialCategory(plan.scope) ??
    (profile ? salesCategoryToMaterialCategory(profile.category) : null);

  if (preferred === "competitor_compare") {
    return ["competitor_compare", "sales_script"];
  }
  if (preferred === "product_info") {
    return ["product_info", "sales_script"];
  }
  if (preferred === "sales_script") {
    if (profile?.category === "sales_qa" && profile.confidence !== "low") {
      return ["sales_script"];
    }
    return ["sales_script", "product_info"];
  }

  if (profile?.category === "own_product") {
    return ["product_info", "sales_script"];
  }

  return ["sales_script", "competitor_compare", "product_info"];
}

function buildSearchQuery(message: string, plan: KnowledgeSearchPlan): string {
  let q = augmentSpecQueryForSearch(message);
  const parts = new Set<string>();
  for (const h of [...(plan.extraFileHints ?? []), ...extractFileHints(message)]) {
    if (h) parts.add(h);
  }
  const competitor = extractMentionedCompetitor(message);
  if (competitor) parts.add(competitor);
  if (isSpecNumericQuery(q)) {
    for (const t of expandSpecSearchTerms(q, [])) parts.add(t);
  }
  if (parts.size === 0) return q.trim();
  return `${[...parts].slice(0, 8).join(" ")} ${q}`.trim();
}

/** 將本次要查的 category 對應到不重複的 data store */
function storesForCategories(
  categories: MaterialCategory[],
): {
  key: string;
  ragCorpusResource: string;
  dataStoreResource?: string;
  categories: MaterialCategory[];
  primary: MaterialCategory;
}[] {
  const map = new Map<string, MaterialCategory[]>();
  const meta = new Map<string, RagCorpusConfig>();
  for (const cat of categories) {
    const corpus = getRagCorpusForCategory(cat);
    if (!corpus) continue;
    const key =
      useVertexRagEngineApi() && corpus.ragCorpusResource
        ? corpus.ragCorpusResource
        : corpus.dataStoreResource ?? "";
    if (!key) continue;
    const list = map.get(key) ?? [];
    if (!list.includes(cat)) list.push(cat);
    map.set(key, list);
    meta.set(key, corpus);
  }
  return Array.from(map.entries()).map(([key, cats]) => {
    const c = meta.get(key)!;
    return {
      key,
      ragCorpusResource: c.ragCorpusResource,
      dataStoreResource: c.dataStoreResource,
      categories: cats,
      primary: cats[0],
    };
  });
}

function filterHitsForCategories(hits: RagChunkHit[], allowed: MaterialCategory[]): RagChunkHit[] {
  if (allowed.length === 0) return hits;
  const filtered = hits.filter(
    (h) => allowed.includes(h.materialCategory) || h.materialCategory === "general",
  );
  if (filtered.length > 0) return filtered;
  return hits.map((h) => ({ ...h, materialCategory: allowed[0] }));
}

/** 問句含競品時，確保 rerank 池內至少有一筆該競品素材 */
function ensureMentionedCompetitorInRerank(
  message: string,
  reranked: RerankedKnowledgeHit[],
  topK: number,
): RerankedKnowledgeHit[] {
  const comp = extractMentionedCompetitor(message);
  if (!comp || reranked.length === 0) return reranked;

  const head = reranked.slice(0, topK);
  const inHead = head.some((s) =>
    blobContainsTerm(`${s.customer_question ?? ""}\n${s.standard_script ?? ""}\n${s.title ?? ""}`, comp),
  );
  if (inHead) return reranked;

  const match = reranked.find((s) =>
    blobContainsTerm(`${s.customer_question ?? ""}\n${s.standard_script ?? ""}\n${s.title ?? ""}`, comp),
  );
  if (!match) return reranked;

  return [match, ...reranked.filter((s) => s !== match)];
}

/**
 * 依路由計畫執行 Vertex AI Search（三語料庫可切換）。
 */
export async function searchKnowledgeByPlanRag(
  message: string,
  plan: KnowledgeSearchPlan,
  profile?: SalesQuestionProfile,
): Promise<ScriptCitation[]> {
  if (plan.intent === "off_topic") return [];

  warnIfRagPartiallyConfigured();
  assertRagConfigured();

  const query = buildSearchQuery(message, plan);
  const categories = corporaForPlan(plan, profile, message);
  const topK = retrievalResultLimit(plan.limit ?? 8) ?? 8;
  const mentionedCompetitor = extractMentionedCompetitor(message);
  const basePerStore = Math.max(4, Math.ceil(topK / Math.max(categories.length, 1)));

  const targets = storesForCategories(categories);
  if (targets.length === 0) return [];

  const vertex = useVertexRagEngineApi();
  const lists = await Promise.all(
    targets.map(async ({ ragCorpusResource, dataStoreResource, categories: cats, primary }) => {
      const perStore =
        mentionedCompetitor && cats.includes("competitor_compare")
          ? Math.max(basePerStore, 12)
          : basePerStore;
      const raw =
        vertex && ragCorpusResource.includes("/ragCorpora/")
          ? await searchVertexRagCorpus(ragCorpusResource, query, primary, perStore)
          : await searchDiscoveryEngineDatastore(
              dataStoreResource ?? "",
              query,
              primary,
              perStore,
            );
      return filterHitsForCategories(raw, cats);
    }),
  );

  let merged = dedupeRagHits(lists.flat());

  /** 競品名素材在向量排序常落在中後段；主池仍缺時以較大 topK 補查 competitor 庫 */
  if (
    mentionedCompetitor &&
    !merged.some((h) => blobContainsTerm(`${h.title}\n${h.snippet}`, mentionedCompetitor))
  ) {
    const compCfg = getRagCorpusForCategory("competitor_compare");
    const compResource = compCfg?.ragCorpusResource;
    if (compResource?.includes("/ragCorpora/") && vertex) {
      const extra = await searchVertexRagCorpus(
        compResource,
        query,
        "competitor_compare",
        Math.max(16, topK * 2),
      );
      const matched = extra.filter((h) =>
        blobContainsTerm(`${h.title}\n${h.snippet}`, mentionedCompetitor),
      );
      if (matched.length > 0) {
        merged = dedupeRagHits([...matched, ...merged]);
      }
    }
  }
  if (merged.length === 0) return [];

  const scope: KnowledgeSearchScope = plan.scope;
  const preferred = getPreferredMaterialCategory(scope);
  const scored = ragHitsToScoredKnowledgeHits(merged);
  let reranked = rerankKnowledgeHits(message, scored, scope, preferred);
  reranked = prioritizeHitsForQuestion(message, reranked);
  reranked = ensureMentionedCompetitorInRerank(message, reranked, topK ?? 8);

  const finalHits: RagChunkHit[] = reranked.slice(0, topK).map((s) => ({
    title: s.customer_question ?? s.title ?? "",
    snippet: s.standard_script ?? "",
    materialCategory: (s.material_category ?? "general") as MaterialCategory,
    relevance: s.bqRelevance,
    productLine: s.product_line !== "_common" ? s.product_line : undefined,
    uri: s.source_locator?.trim() || undefined,
  }));

  let hitsForRefine = finalHits;
  if (
    mentionedCompetitor &&
    !finalHits.some((h) => blobContainsTerm(`${h.title}\n${h.snippet}`, mentionedCompetitor))
  ) {
    const fromMerged = merged.filter((h) =>
      blobContainsTerm(`${h.title}\n${h.snippet}`, mentionedCompetitor),
    );
    if (fromMerged.length > 0) hitsForRefine = fromMerged.slice(0, Math.max(topK, 8));
  }

  const displayHits = refineRagHitsForDisplay(message, hitsForRefine, profile);

  if (process.env.NODE_ENV === "development" && displayHits[0]) {
    console.info("[sales] rag retrieval", {
      api: vertex ? "vertex-rag-engine" : "discovery-engine",
      corpora: listConfiguredRagCorpora().map((c) => c.materialCategory),
      queried: categories,
      stores: targets.length,
      hits: displayHits.length,
      pool: finalHits.length,
      top: displayHits[0].title?.slice(0, 40),
    });
  }

  return ragHitsToCitations(displayHits, message);
}
