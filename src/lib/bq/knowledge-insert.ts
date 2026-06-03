import { BigQuery } from "@google-cloud/bigquery";
import type { KnowledgeUnitRow, SourceAssetRow } from "@/lib/ingest/contracts/knowledge-unit-contract";
import { getBigQueryKnowledgeConfig, getBigQueryProjectId } from "@/lib/bq/knowledge-config";

export function getBigQueryClientForKnowledge(): BigQuery {
  const projectId = getBigQueryProjectId();
  if (!projectId) {
    throw new Error("請設定 BIGQUERY_PROJECT_ID 或 GOOGLE_CLOUD_PROJECT");
  }
  return new BigQuery({ projectId });
}

export type InsertChunkResult = {
  inserted: number;
  failed: number;
  insertErrors: { message: string; row?: unknown }[];
};

type PartialFailureLike = {
  name?: string;
  errors?: { errors: { message?: string; reason?: string }[]; row?: unknown }[];
};

function isPartialFailureError(e: unknown): e is PartialFailureLike {
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    (e as { name: string }).name === "PartialFailureError" &&
    "errors" in e &&
    Array.isArray((e as PartialFailureLike).errors)
  );
}

async function insertRows<T extends Record<string, unknown>>(
  tableId: string,
  rows: T[],
): Promise<InsertChunkResult> {
  if (rows.length === 0) {
    return { inserted: 0, failed: 0, insertErrors: [] };
  }
  const { dataset } = getBigQueryKnowledgeConfig();
  const client = getBigQueryClientForKnowledge();
  const table = client.dataset(dataset).table(tableId);

  const insertErrors: { message: string; row?: unknown }[] = [];
  const chunkSize = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    try {
      await table.insert(chunk, {
        skipInvalidRows: false,
        ignoreUnknownValues: false,
      });
      inserted += chunk.length;
    } catch (e: unknown) {
      if (isPartialFailureError(e) && e.errors) {
        inserted += chunk.length - e.errors.length;
        for (const fe of e.errors) {
          const msg =
            fe.errors?.map((x) => `${x.reason ?? ""}: ${x.message ?? ""}`).join("; ") || "insert row failed";
          insertErrors.push({ message: msg, row: fe.row });
        }
      } else {
        throw e;
      }
    }
  }

  return { inserted, failed: insertErrors.length, insertErrors };
}

export async function insertSourceAssetRows(rows: SourceAssetRow[]): Promise<InsertChunkResult> {
  const { sourceAssetsTable } = getBigQueryKnowledgeConfig();
  return insertRows(sourceAssetsTable, rows as unknown as Record<string, unknown>[]);
}

export async function insertKnowledgeUnitRows(rows: KnowledgeUnitRow[]): Promise<InsertChunkResult> {
  const { knowledgeUnitsTable } = getBigQueryKnowledgeConfig();
  return insertRows(knowledgeUnitsTable, rows as unknown as Record<string, unknown>[]);
}

/** 依 content_hash 查詢已存在的 unit（dedupe） */
export async function findExistingContentHashes(hashes: string[]): Promise<Set<string>> {
  if (hashes.length === 0) return new Set();
  const { projectId, dataset, knowledgeUnitsTable } = getBigQueryKnowledgeConfig();
  if (!projectId) return new Set();

  const client = getBigQueryClientForKnowledge();
  const unique = [...new Set(hashes)].slice(0, 500);
  const sql = `
    SELECT DISTINCT content_hash
    FROM \`${projectId}.${dataset}.${knowledgeUnitsTable}\`
    WHERE content_hash IN UNNEST(@hashes)
  `;
  const [rows] = await client.query({ query: sql, params: { hashes: unique } });
  return new Set((rows as { content_hash?: string }[]).map((r) => r.content_hash).filter(Boolean) as string[]);
}

/** 更新 source_assets 解析狀態 */
export async function updateSourceAssetParseStatus(
  assetId: string,
  parseStatus: string,
  parseError: string | null,
): Promise<void> {
  const { projectId, dataset, sourceAssetsTable } = getBigQueryKnowledgeConfig();
  const client = getBigQueryClientForKnowledge();
  const sql = `
    UPDATE \`${projectId}.${dataset}.${sourceAssetsTable}\`
    SET parse_status = @parseStatus, parse_error = @parseError
    WHERE asset_id = @assetId
  `;
  await client.query({
    query: sql,
    params: { assetId, parseStatus, parseError },
  });
}

/** 列出待解析的 PDF/PPT 資產（供 parse job） */
export async function listPendingParseAssets(limit = 100): Promise<SourceAssetRow[]> {
  const { projectId, dataset, sourceAssetsTable } = getBigQueryKnowledgeConfig();
  const client = getBigQueryClientForKnowledge();
  const sql = `
    SELECT *
    FROM \`${projectId}.${dataset}.${sourceAssetsTable}\`
    WHERE parse_status = 'pending'
      AND (
        LOWER(file_name) LIKE '%.pdf'
        OR LOWER(file_name) LIKE '%.pptx'
        OR LOWER(file_name) LIKE '%.ppt'
      )
    ORDER BY ingested_at
    LIMIT ${Math.min(limit, 500)}
  `;
  const [rows] = await client.query({ query: sql });
  return rows as SourceAssetRow[];
}
