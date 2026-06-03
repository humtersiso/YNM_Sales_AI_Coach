import { getBigQueryClient } from "@/lib/bq/script-drills-insert";
import {
  getBigQueryDataset,
  getBigQueryProjectId,
  getSalesKnowledgeTableId,
} from "@/lib/bq/knowledge-config";
import { embedText } from "@/lib/gemini/knowledge-embedding";
import type { ScoredKnowledgeHit } from "@/lib/gemini/knowledge-search";
import {
  getPreferredMaterialCategory,
  type KnowledgeSearchScope,
} from "@/lib/knowledge/search-scope";
import { useSemanticSearch } from "@/lib/gemini/sales-chat-speed";

const EMBEDDINGS_TABLE =
  (process.env.BIGQUERY_TABLE_KNOWLEDGE_EMBEDDINGS ?? "knowledge_unit_embeddings").trim();

/**
 * 語意檢索：需 knowledge_unit_embeddings 表已有資料（見 scripts/bq-backfill-knowledge-embeddings.ts）。
 * 無 embedding 或表空時回傳 []，不阻斷主流程。
 */
export async function searchKnowledgeSemantic(
  message: string,
  scope: KnowledgeSearchScope = {},
  limit = 15,
): Promise<ScoredKnowledgeHit[]> {
  if (!useSemanticSearch()) return [];

  const projectId = getBigQueryProjectId();
  const dataset = getBigQueryDataset();
  const viewTable = getSalesKnowledgeTableId();
  if (!projectId) return [];

  const queryEmbedding = await embedText(message);
  if (!queryEmbedding?.length) return [];

  const preferred = getPreferredMaterialCategory(scope);
  const params: Record<string, unknown> = {
    queryEmbedding,
  };
  let productFilter = "";
  if (scope.productLine?.trim()) {
    productFilter = `AND (k.product_line = @productLine OR k.product_line = '_common')`;
    params.productLine = scope.productLine.trim();
  }

  let categoryBoost = "0";
  if (preferred?.trim()) {
    categoryBoost = `CASE WHEN k.material_category = @preferredCategory THEN 10 ELSE 0 END`;
    params.preferredCategory = preferred.trim();
  }

  const sql = `
    WITH scored AS (
      SELECT
        k.customer_question,
        k.title,
        k.standard_script_idea AS standard_script,
        k.material_category,
        k.product_line,
        k.source_locator,
        (1 - ML.DISTANCE(e.embedding, @queryEmbedding, 'COSINE')) AS cosine_sim
      FROM \`${projectId}.${dataset}.${EMBEDDINGS_TABLE}\` e
      INNER JOIN \`${projectId}.${dataset}.${viewTable}\` k
        ON LOWER(TRIM(k.customer_question)) = LOWER(TRIM(e.customer_question))
      WHERE ARRAY_LENGTH(e.embedding) > 0
        ${productFilter}
    )
    SELECT
      customer_question,
      title,
      standard_script,
      material_category,
      product_line,
      source_locator,
      (cosine_sim * 100 + ${categoryBoost}) AS relevance
    FROM scored
    WHERE cosine_sim >= 0.55
    ORDER BY relevance DESC
    LIMIT ${limit}
  `;

  try {
    const client = getBigQueryClient();
    const [rows] = await client.query({ query: sql, params });
    return (rows as ScoredKnowledgeHit[]).map((r) => ({
      ...r,
      bqRelevance: Number(r.relevance ?? 0),
    }));
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[semantic] search skipped:", (e as Error).message?.slice(0, 120));
    }
    return [];
  }
}
