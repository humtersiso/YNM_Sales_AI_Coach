/**
 * 凍結契約：各車款訓練素材 → BigQuery knowledge_units / source_assets。
 * 欄位名與 DDL 必須同步。車款以 product_line 區分（例：xtrail-ice、kicks）。
 */

/** 平台級來源（非車款名） */
export const DEFAULT_SOURCE_SYSTEM = "ynm_training";

/** @deprecated 請用 DEFAULT_SOURCE_SYSTEM + product_line */
export const KNOWLEDGE_SOURCE_SYSTEM = DEFAULT_SOURCE_SYSTEM;

export const KNOWLEDGE_UNIT_TYPES = ["qa_pair", "text_chunk", "table_row"] as const;
export type KnowledgeUnitType = (typeof KNOWLEDGE_UNIT_TYPES)[number];

export const PARSE_STATUSES = ["pending", "ok", "failed", "unsupported"] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

/** BQ 表名（可經 env 覆寫） */
export const DEFAULT_BQ_TABLE_SOURCE_ASSETS = "source_assets";
export const DEFAULT_BQ_TABLE_KNOWLEDGE_UNITS = "knowledge_units";
export const DEFAULT_BQ_VIEW_SALES_KNOWLEDGE = "v_sales_knowledge";

export type SourceLocator = {
  page?: number;
  slide?: number;
  sheet?: string;
  row?: number;
};

import type { MaterialCategory } from "./material-category-contract";

export type KnowledgeUnitRow = {
  unit_id: string;
  ingest_batch_id: string;
  asset_id: string;
  product_line: string;
  material_category: MaterialCategory;
  unit_type: KnowledgeUnitType;
  title: string | null;
  customer_question: string | null;
  standard_script: string | null;
  source_locator: string | null;
  tags: string[];
  language: string;
  content_hash: string;
  ingested_at: string;
};

export type SourceAssetRow = {
  asset_id: string;
  ingest_batch_id: string;
  source_system: string;
  product_line: string;
  material_category: MaterialCategory;
  relative_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  content_hash: string;
  gcs_uri: string | null;
  parse_status: ParseStatus;
  parse_error: string | null;
  ingested_at: string;
};

export function locatorToJson(loc: SourceLocator | null | undefined): string | null {
  if (!loc || Object.keys(loc).length === 0) return null;
  return JSON.stringify(loc);
}
