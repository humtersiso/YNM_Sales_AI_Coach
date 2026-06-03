import {
  DEFAULT_BQ_TABLE_KNOWLEDGE_UNITS,
  DEFAULT_BQ_TABLE_SOURCE_ASSETS,
  DEFAULT_BQ_VIEW_SALES_KNOWLEDGE,
} from "@/lib/ingest/contracts/knowledge-unit-contract";

export type BigQueryKnowledgeConfig = {
  projectId: string;
  dataset: string;
  sourceAssetsTable: string;
  knowledgeUnitsTable: string;
  salesKnowledgeView: string;
  legacyScriptTable: string;
};

export function getBigQueryProjectId(): string {
  return (
    process.env.BIGQUERY_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    ""
  ).trim();
}

export function getBigQueryDataset(): string {
  return (process.env.BIGQUERY_DATASET ?? "sales_training_poc").trim();
}

export function getBigQueryKnowledgeConfig(): BigQueryKnowledgeConfig {
  const projectId = getBigQueryProjectId();
  const dataset = getBigQueryDataset();
  return {
    projectId,
    dataset,
    sourceAssetsTable: (process.env.BIGQUERY_TABLE_SOURCE_ASSETS ?? DEFAULT_BQ_TABLE_SOURCE_ASSETS).trim(),
    knowledgeUnitsTable: (process.env.BIGQUERY_TABLE_KNOWLEDGE_UNITS ?? DEFAULT_BQ_TABLE_KNOWLEDGE_UNITS).trim(),
    salesKnowledgeView: (process.env.BIGQUERY_TABLE_KNOWLEDGE ?? DEFAULT_BQ_VIEW_SALES_KNOWLEDGE).trim(),
    legacyScriptTable: (process.env.BIGQUERY_TABLE_SCRIPT_DRILLS ?? "sales script").trim(),
  };
}

/** 銷售助手 / chat 檢索用的表或 view */
export function getSalesKnowledgeTableId(): string {
  const useView = (process.env.BIGQUERY_USE_KNOWLEDGE_VIEW ?? "true").toLowerCase();
  if (useView === "false" || useView === "0") {
    return (process.env.BIGQUERY_TABLE_SCRIPT_DRILLS ?? "sales script").trim();
  }
  return getBigQueryKnowledgeConfig().salesKnowledgeView;
}

export function tableFqn(projectId: string, dataset: string, tableId: string): string {
  return `\`${projectId}.${dataset}.${tableId}\``;
}

/**
 * 銷售助手僅檢索指定車款（例：xtrail-ice）。
 * 未設定時查全部車款 training（不含舊 sales script）。
 */
export function getSalesChatProductLine(): string | null {
  const raw = (process.env.SALES_CHAT_PRODUCT_LINE ?? "").trim();
  return raw || null;
}

/** 預設素材類別（未選時不篩類別） */
export function getSalesChatMaterialCategory(): string | null {
  const raw = (process.env.SALES_CHAT_MATERIAL_CATEGORY ?? "").trim();
  return raw || null;
}
