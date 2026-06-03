import {
  SCRIPT_DRILL_BQ_FIELDS,
  SCRIPT_DRILL_DISPLAY_HEADERS,
  type ScriptDrillDisplayKey,
} from "@/lib/ingest/script-drills-contract";
import type { GridRow } from "@/lib/excel-store/grid-reader";
import { getBigQueryClient, getBigQueryScriptDrillsConfig } from "@/lib/bq/script-drills-insert";
import { getSalesKnowledgeTableId } from "@/lib/bq/knowledge-config";
import { MATERIAL_CATEGORY_LABELS } from "@/lib/ingest/contracts/material-category-contract";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { listActiveProductLines } from "@/lib/ingest/contracts/training-product-registry";

const BQ_ROW_LIMIT = 5000;

export type MainWorkbookQueryFilters = {
  productLine?: string | null;
  materialCategory?: MaterialCategory | null;
};

export type MainWorkbookFromBq = {
  dataSourceLabel: string;
  duplicateCount: number;
  pendingCount: number;
  expertCount: number;
  tagCount: number;
  rowsGR: GridRow[];
  source: "bigquery";
  filters?: MainWorkbookQueryFilters;
};

export type KnowledgeDuplicateCandidate = {
  id: string;
  originalText: string;
  suggestedReply: string;
};

function getTableFqn() {
  const { projectId, dataset } = getBigQueryScriptDrillsConfig();
  const useView = (process.env.BIGQUERY_USE_KNOWLEDGE_VIEW ?? "true").toLowerCase();
  const tableId =
    useView === "false" || useView === "0"
      ? getBigQueryScriptDrillsConfig().tableId
      : getSalesKnowledgeTableId();
  if (!projectId) {
    throw new Error("請設定 BIGQUERY_PROJECT_ID 或 GOOGLE_CLOUD_PROJECT");
  }
  return { projectId, dataset, tableId, fqn: `\`${projectId}.${dataset}.${tableId}\`` };
}

function bqFieldToDisplayKey(field: string): ScriptDrillDisplayKey | null {
  for (const key of SCRIPT_DRILL_DISPLAY_HEADERS) {
    if (SCRIPT_DRILL_BQ_FIELDS[key] === field) return key;
  }
  return null;
}

function rowToGridRow(row: Record<string, unknown>, index: number): GridRow | null {
  const cols: Record<string, string> = {};
  let hasQuestion = false;

  const question =
    String(row.customer_question ?? "").trim() ||
    String(row.customer_question_text ?? "").trim();
  const script = String(
    row.standard_script ?? row.standard_script_idea ?? "",
  ).trim();

  if (question) {
    cols["客戶疑問"] = question;
    hasQuestion = true;
  }
  if (script) {
    cols["標準話術"] = script;
  }

  const pl = String(row.product_line ?? "").trim();
  if (pl) cols["車款"] = pl;
  const cat = String(row.material_category ?? "").trim() as MaterialCategory;
  if (cat && MATERIAL_CATEGORY_LABELS[cat]) {
    cols["類別"] = MATERIAL_CATEGORY_LABELS[cat];
  }

  for (const [field, value] of Object.entries(row)) {
    const displayKey = bqFieldToDisplayKey(field);
    if (!displayKey || displayKey === "客戶疑問" || displayKey === "標準話術") continue;
    const text = String(value ?? "").trim();
    if (text) cols[displayKey] = text;
  }

  if (!hasQuestion) return null;

  const id =
    row.source_row != null
      ? `bq-row-${row.source_row}`
      : `bq-${index}-${question.slice(0, 12)}`;

  return { id, cols };
}

function buildViewWhere(filters?: MainWorkbookQueryFilters): string {
  const parts = ["TRIM(COALESCE(customer_question, '')) != ''"];
  if (filters?.productLine) {
    parts.push(
      `(product_line IS NULL OR product_line = @productLine OR product_line = '_common')`,
    );
  }
  if (filters?.materialCategory) {
    parts.push(`(material_category IS NULL OR material_category = @materialCategory)`);
  }
  return parts.join(" AND ");
}

/** 知識 view（v_sales_knowledge） */
const KNOWLEDGE_VIEW_DATA_SQL = (fqn: string, filters?: MainWorkbookQueryFilters) => `
  SELECT
    customer_question,
    standard_script_idea AS standard_script,
    product_line,
    material_category,
    knowledge_source
  FROM ${fqn}
  WHERE ${buildViewWhere(filters)}
  ORDER BY product_line, material_category, customer_question
  LIMIT ${BQ_ROW_LIMIT}
`;

/** YNM 正式表（sales script）：欄位為 standard_script_idea、es/ul/… */
const PRODUCTION_DATA_SQL = (fqn: string) => `
  SELECT
    customer_question,
    standard_script_idea AS standard_script,
    es AS reviewer_es,
    ul AS reviewer_ul,
    yj AS reviewer_yj,
    em AS reviewer_em,
    yf AS reviewer_yf,
    hl AS reviewer_hl,
    kt AS reviewer_kt,
    ya AS reviewer_ya,
    msd_confirmation
  FROM ${fqn}
  WHERE TRIM(COALESCE(customer_question, '')) != ''
  ORDER BY customer_question
  LIMIT ${BQ_ROW_LIMIT}
`;

function useKnowledgeView(): boolean {
  const flag = (process.env.BIGQUERY_USE_KNOWLEDGE_VIEW ?? "true").toLowerCase();
  return flag !== "false" && flag !== "0";
}

/** PoC staging 表（script_drills_staging DDL） */
const STAGING_DATA_SQL = (fqn: string) => `
  SELECT
    source_row,
    customer_question,
    standard_script,
    reviewer_es,
    reviewer_ul,
    reviewer_yj,
    reviewer_em,
    reviewer_yf,
    reviewer_hl,
    reviewer_kt,
    reviewer_ya,
    msd_confirmation
  FROM ${fqn}
  WHERE TRIM(COALESCE(customer_question, '')) != ''
  ORDER BY COALESCE(source_row, 999999)
  LIMIT ${BQ_ROW_LIMIT}
`;

async function queryMainDataRows(
  fqn: string,
  filters?: MainWorkbookQueryFilters,
): Promise<Record<string, unknown>[]> {
  const client = getBigQueryClient();
  if (useKnowledgeView()) {
    const params: Record<string, string> = {};
    if (filters?.productLine) params.productLine = filters.productLine;
    if (filters?.materialCategory) params.materialCategory = filters.materialCategory;
    const [result] = await client.query({
      query: KNOWLEDGE_VIEW_DATA_SQL(fqn, filters),
      params: Object.keys(params).length ? params : undefined,
    });
    return result as Record<string, unknown>[];
  }
  try {
    const [result] = await client.query({ query: PRODUCTION_DATA_SQL(fqn) });
    return result as Record<string, unknown>[];
  } catch (productionError) {
    try {
      const [result] = await client.query({ query: STAGING_DATA_SQL(fqn) });
      return result as Record<string, unknown>[];
    } catch {
      throw productionError;
    }
  }
}

/**
 * 讀取 BQ 話術表，回傳與原 Excel 總覽 API 相同形狀的資料（供 UI 呈現）。
 */
export async function fetchMainWorkbookFromBq(
  filters?: MainWorkbookQueryFilters,
): Promise<MainWorkbookFromBq> {
  const { fqn, projectId, dataset, tableId } = getTableFqn();
  const dataSourceLabel = `${projectId}.${dataset}.${tableId}`;

  const countSql = `
    SELECT COUNT(*) AS cnt
    FROM ${fqn}
    WHERE ${buildViewWhere(filters)}
  `;
  const client = getBigQueryClient();
  const countParams: Record<string, string> = {};
  if (filters?.productLine) countParams.productLine = filters.productLine;
  if (filters?.materialCategory) countParams.materialCategory = filters.materialCategory;
  const [countRows] = await client.query({
    query: countSql,
    params: Object.keys(countParams).length ? countParams : undefined,
  });
  const duplicateCount = Number((countRows as { cnt?: number }[])?.[0]?.cnt ?? 0);

  const rows = await queryMainDataRows(fqn, filters);
  const rowsGR = rows
    .map((row, i) => rowToGridRow(row, i))
    .filter((r): r is GridRow => r !== null);

  return {
    dataSourceLabel,
    duplicateCount,
    pendingCount: 0,
    expertCount: 0,
    tagCount: 0,
    rowsGR,
    source: "bigquery",
    filters,
  };
}

export function getAdminFilterOptions() {
  return {
    productLines: listActiveProductLines().map((p) => ({
      id: p.id,
      displayName: p.displayName,
    })),
    materialCategories: (
      ["product_info", "competitor_compare", "sales_script"] as MaterialCategory[]
    ).map((id) => ({ id, label: MATERIAL_CATEGORY_LABELS[id] })),
  };
}

const PRODUCTION_KB_SQL = (fqn: string) => `
  SELECT
    customer_question,
    standard_script_idea AS standard_script
  FROM ${fqn}
  WHERE TRIM(COALESCE(customer_question, '')) != ''
  LIMIT ${BQ_ROW_LIMIT}
`;

const STAGING_KB_SQL = (fqn: string) => `
  SELECT source_row, customer_question, standard_script
  FROM ${fqn}
  WHERE TRIM(COALESCE(customer_question, '')) != ''
  LIMIT ${BQ_ROW_LIMIT}
`;

/** 供匯入比對：以 BQ 題庫作為知識庫候選 */
export async function listKnowledgeBaseFromBq(): Promise<KnowledgeDuplicateCandidate[]> {
  const { fqn } = getTableFqn();
  const client = getBigQueryClient();

  let rows: Record<string, unknown>[];
  try {
    const [result] = await client.query({ query: PRODUCTION_KB_SQL(fqn) });
    rows = result as Record<string, unknown>[];
  } catch (productionError) {
    try {
      const [result] = await client.query({ query: STAGING_KB_SQL(fqn) });
      rows = result as Record<string, unknown>[];
    } catch {
      throw productionError;
    }
  }

  return rows
    .map((row, i) => {
      const originalText = String(row.customer_question ?? "").trim();
      const script = String(row.standard_script ?? "").trim();
      if (!originalText) return null;
      return {
        id: row.source_row != null ? `bq-${row.source_row}` : `bq-kb-${i}`,
        originalText,
        suggestedReply: script || "（題庫尚無標準話術）",
      };
    })
    .filter((r): r is KnowledgeDuplicateCandidate => r !== null);
}

export function isBigQueryConfigured(): boolean {
  const { projectId } = getBigQueryScriptDrillsConfig();
  return Boolean(projectId);
}

/** 匯入比對：僅使用 BQ 題庫 */
export async function getKnowledgeBaseForDuplicateCheck(): Promise<KnowledgeDuplicateCandidate[]> {
  if (!isBigQueryConfigured()) {
    throw new Error("未設定 BigQuery 專案（BIGQUERY_PROJECT_ID），無法載入題庫。");
  }
  const fromBq = await listKnowledgeBaseFromBq();
  if (fromBq.length === 0) {
    throw new Error("BigQuery 題庫尚無有效資料列（customer_question 為空）。");
  }
  return fromBq;
}
