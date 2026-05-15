import { BigQuery } from "@google-cloud/bigquery";
import type { ScriptDrillBqRow } from "@/lib/ingest/parse-script-drills-xlsx";

export type BigQueryScriptDrillsConfig = {
  projectId: string;
  dataset: string;
  tableId: string;
};

export function getBigQueryScriptDrillsConfig(): BigQueryScriptDrillsConfig {
  const projectId = (
    process.env.BIGQUERY_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    ""
  ).trim();
  const dataset = (process.env.BIGQUERY_DATASET ?? "sales_training_poc").trim();
  const tableId = (process.env.BIGQUERY_TABLE_SCRIPT_DRILLS ?? "script_drills_staging").trim();
  return { projectId, dataset, tableId };
}

export function getBigQueryClient(): BigQuery {
  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId) {
    throw new Error("請設定 BIGQUERY_PROJECT_ID 或 GOOGLE_CLOUD_PROJECT");
  }
  return new BigQuery({ projectId });
}

export type InsertScriptDrillsResult = {
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

/**
 * 以 insertAll 寫入 staging；大量資料建議改 GCS + load job。
 */
export async function insertScriptDrillRows(rows: ScriptDrillBqRow[]): Promise<InsertScriptDrillsResult> {
  if (rows.length === 0) {
    return { inserted: 0, failed: 0, insertErrors: [] };
  }
  const { dataset, tableId } = getBigQueryScriptDrillsConfig();
  const client = getBigQueryClient();
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
          const msg = fe.errors?.map((x) => `${x.reason ?? ""}: ${x.message ?? ""}`).join("; ") || "insert row failed";
          insertErrors.push({ message: msg, row: fe.row });
        }
      } else {
        throw e;
      }
    }
  }

  return {
    inserted,
    failed: insertErrors.length,
    insertErrors,
  };
}
