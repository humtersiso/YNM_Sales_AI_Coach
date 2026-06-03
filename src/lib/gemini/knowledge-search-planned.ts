import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { searchKnowledgeByPlanRag } from "@/lib/gemini/knowledge-search-rag";
import { isRagKnowledgeBackend } from "@/lib/knowledge/knowledge-backend";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { ragHitsToScoredKnowledgeHits } from "@/lib/rag/rag-to-citations";
import {
  extractFileHints,
  extractSearchKeywords,
  hitsToCitations,
  mergeKnowledgeHits,
  searchByFileHints,
  searchByKeywords,
  searchKnowledgeRawHits,
  type ScoredKnowledgeHit,
} from "@/lib/gemini/knowledge-search";
import { prioritizeHitsForQuestion } from "@/lib/gemini/citation-prioritize";
import {
  reciprocalRankFusion,
  rerankKnowledgeHits,
} from "@/lib/gemini/knowledge-rerank";
import { searchKnowledgeSemantic } from "@/lib/gemini/knowledge-search-semantic";
import { rewriteQueryForSearch } from "@/lib/gemini/query-rewrite";
import type { KnowledgeSearchScope } from "@/lib/knowledge/search-scope";
import { getPreferredMaterialCategory } from "@/lib/knowledge/search-scope";
import type { KnowledgeSearchPlan } from "@/lib/gemini/sales-intent-router";
import type { SalesQuestionProfile } from "@/lib/gemini/sales-question-profile";
import {
  retrievalRecallPoolSize,
  retrievalResultLimit,
  sqlRecallLimit,
  useQueryRewrite,
  useSemanticSearch,
} from "@/lib/gemini/sales-chat-speed";

async function recallWithOptionalRewrite(
  message: string,
  scope: KnowledgeSearchScope,
  profile: SalesQuestionProfile | undefined,
  poolLimit: number | null,
): Promise<ScoredKnowledgeHit[]> {
  const poolSize = sqlRecallLimit(poolLimit);
  const hints = extractFileHints(message);

  const primaryPromise = searchKnowledgeRawHits(message, scope, poolLimit);
  const hintsPromise =
    hints.length > 0 ? searchByFileHints(hints, scope, poolSize) : Promise.resolve([] as ScoredKnowledgeHit[]);

  const [primary, hinted] = await Promise.all([primaryPromise, hintsPromise]);
  const channels: ScoredKnowledgeHit[][] = [primary];
  if (hinted.length) channels.push(hinted);

  const rewriteMinHits = profile?.confidence === "low" ? 2 : 1;
  const needsRewrite =
    useQueryRewrite() && profile && primary.length < rewriteMinHits;

  const sideTasks: Promise<ScoredKnowledgeHit[]>[] = [];

  if (needsRewrite) {
    sideTasks.push(
      (async () => {
        try {
          const terms = await rewriteQueryForSearch(message, profile!.heroProduct.displayName);
          const searches = terms.map(async (term) => {
            const kw = extractSearchKeywords(term);
            if (!kw.length) return [] as ScoredKnowledgeHit[];
            return searchByKeywords(kw, scope, poolSize);
          });
          const results = await Promise.all(searches);
          return results.flat();
        } catch (e) {
          console.warn("[search] query rewrite failed", (e as Error).message?.slice(0, 80));
          return [];
        }
      })(),
    );
  }

  if (useSemanticSearch() && primary.length < 3) {
    sideTasks.push(searchKnowledgeSemantic(message, scope, poolSize).catch(() => [] as ScoredKnowledgeHit[]));
  }

  if (sideTasks.length > 0) {
    const extras = await Promise.all(sideTasks);
    for (const list of extras) {
      if (list.length) channels.push(list);
    }
  }

  if (channels.length === 1) return primary;

  const fused = reciprocalRankFusion(channels);
  return mergeKnowledgeHits([fused, ...channels]);
}

/**
 * 依路由計畫檢索知識（SALES_KNOWLEDGE_BACKEND=rag|bq）。
 */
export async function searchKnowledgeByPlan(
  message: string,
  plan: KnowledgeSearchPlan,
  profile?: SalesQuestionProfile,
): Promise<ScriptCitation[]> {
  if (isRagKnowledgeBackend()) {
    return searchKnowledgeByPlanRag(message, plan, profile);
  }
  return searchKnowledgeByPlanBq(message, plan, profile);
}

/**
 * 依路由計畫執行 BQ 檢索（多通道召回 + rerank，category 僅軟加分）。
 */
export async function searchKnowledgeByPlanBq(
  message: string,
  plan: KnowledgeSearchPlan,
  profile?: SalesQuestionProfile,
): Promise<ScriptCitation[]> {
  if (plan.intent === "off_topic") return [];

  const mergedHints = [
    ...new Set([...(plan.extraFileHints ?? []), ...extractFileHints(message)]),
  ];

  const topK = retrievalResultLimit(plan.limit ?? 8);
  const scopeWithHints = plan.scope;

  let pool: ScoredKnowledgeHit[] = [];

  if (mergedHints.length > 0) {
    const hintedMessage = `${mergedHints.join(" ")} ${message}`;
    pool = await recallWithOptionalRewrite(hintedMessage, scopeWithHints, profile, retrievalRecallPoolSize());
  }

  if (pool.length < 2) {
    pool = await recallWithOptionalRewrite(message, scopeWithHints, profile, retrievalRecallPoolSize());
  }

  if (pool.length === 0 && scopeWithHints.productLine) {
    pool = await recallWithOptionalRewrite(
      message,
      { ...scopeWithHints, productLine: null },
      profile,
      retrievalRecallPoolSize(),
    );
  }

  const preferred = getPreferredMaterialCategory(scopeWithHints);
  let reranked = rerankKnowledgeHits(message, pool, scopeWithHints, preferred);
  reranked = prioritizeHitsForQuestion(message, reranked);

  if (process.env.NODE_ENV === "development" && reranked[0]) {
    console.info("[sales] retrieval", {
      pool: pool.length,
      topQ: reranked[0].customer_question?.slice(0, 40),
      score: reranked[0].rerankScore,
      category: profile?.category,
    });
  }

  const sliced = topK == null ? reranked : reranked.slice(0, topK);
  return hitsToCitations(sliced);
}

/** 供測試：回傳 rerank 前後 hit 列表 */
export async function searchKnowledgeHitsByPlan(
  message: string,
  plan: KnowledgeSearchPlan,
  profile?: SalesQuestionProfile,
): Promise<ScoredKnowledgeHit[]> {
  if (plan.intent === "off_topic") return [];
  if (isRagKnowledgeBackend()) {
    const citations = await searchKnowledgeByPlanRag(message, plan, profile);
    return ragHitsToScoredKnowledgeHits(
      citations.map((c) => ({
        title: c.question,
        snippet: c.script,
        materialCategory: (c.materialCategory ?? "general") as MaterialCategory,
        relevance: 50,
      })),
    );
  }

  const pool = await recallWithOptionalRewrite(
    message,
    plan.scope,
    profile,
    retrievalRecallPoolSize(),
  );
  const preferred = getPreferredMaterialCategory(plan.scope);
  return rerankKnowledgeHits(message, pool, plan.scope, preferred);
}
