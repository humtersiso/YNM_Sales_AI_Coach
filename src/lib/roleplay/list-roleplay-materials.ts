import { createHash } from "node:crypto";
import { getBigQueryClient, getBigQueryScriptDrillsConfig } from "@/lib/bq/script-drills-insert";
import { getSalesKnowledgeTableId } from "@/lib/bq/knowledge-config";
import {
  MATERIAL_CATEGORY_LABELS,
  type MaterialCategory,
} from "@/lib/ingest/contracts/material-category-contract";
import {
  getProductLine,
  listActiveProductLines,
} from "@/lib/ingest/contracts/training-product-registry";
import type {
  RoleplayMaterialItem,
  RoleplayMaterialsResponse,
  RoleplayProductSummary,
} from "@/lib/roleplay/materials-types";
import { ROLEPLAY_MATERIAL_CATEGORIES } from "@/lib/roleplay/materials-types";

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;

function knowledgeFqn(): string {
  const { projectId, dataset } = getBigQueryScriptDrillsConfig();
  const useView = (process.env.BIGQUERY_USE_KNOWLEDGE_VIEW ?? "true").toLowerCase();
  const tableId =
    useView === "false" || useView === "0"
      ? getBigQueryScriptDrillsConfig().tableId
      : getSalesKnowledgeTableId();
  if (!projectId) {
    throw new Error("請設定 BIGQUERY_PROJECT_ID 或 GOOGLE_CLOUD_PROJECT");
  }
  return `\`${projectId}.${dataset}.${tableId}\``;
}

function materialId(
  productLine: string,
  category: string,
  question: string,
): string {
  return createHash("sha256")
    .update(`${productLine}|${category}|${question}`)
    .digest("hex")
    .slice(0, 16);
}

function productLineLabel(id: string): string {
  if (id === "_common") return "共用";
  return getProductLine(id)?.displayName ?? id;
}

function normalizeCategory(raw: unknown): MaterialCategory {
  const v = String(raw ?? "general").trim() as MaterialCategory;
  if (v in MATERIAL_CATEGORY_LABELS) return v;
  return "general";
}

export async function listRoleplayMaterials(options?: {
  productLine?: string | null;
  materialCategory?: MaterialCategory | null;
  limit?: number;
}): Promise<RoleplayMaterialsResponse> {
  const fqn = knowledgeFqn();
  const client = getBigQueryClient();
  const productLine = options?.productLine?.trim() || null;
  const materialCategory = options?.materialCategory ?? null;
  const limit = Math.min(
    Math.max(options?.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const categoryPlaceholders = ROLEPLAY_MATERIAL_CATEGORIES.map((_, i) => `@cat${i}`).join(", ");
  const whereParts = [
    "TRIM(COALESCE(customer_question, '')) != ''",
    `material_category IN (${categoryPlaceholders})`,
  ];
  const params: Record<string, string> = {};
  ROLEPLAY_MATERIAL_CATEGORIES.forEach((c, i) => {
    params[`cat${i}`] = c;
  });

  if (productLine) {
    whereParts.push(
      "(product_line = @productLine OR product_line = '_common' OR product_line IS NULL)",
    );
    params.productLine = productLine;
  }
  if (materialCategory) {
    whereParts.push("material_category = @materialCategory");
    params.materialCategory = materialCategory;
  }

  const where = whereParts.join(" AND ");

  const [summaryRows] = await client.query({
    query: `
      SELECT
        COALESCE(NULLIF(TRIM(product_line), ''), '_common') AS product_line,
        COALESCE(NULLIF(TRIM(material_category), ''), 'general') AS material_category,
        COUNT(*) AS cnt
      FROM ${fqn}
      WHERE ${where}
      GROUP BY product_line, material_category
      ORDER BY product_line, material_category
    `,
    params,
  });

  const summaryMap = new Map<string, RoleplayProductSummary>();
  for (const row of summaryRows as Record<string, unknown>[]) {
    const pl = String(row.product_line ?? "_common");
    const cat = normalizeCategory(row.material_category);
    const count = Number(row.cnt ?? 0);
    if (!ROLEPLAY_MATERIAL_CATEGORIES.includes(cat as (typeof ROLEPLAY_MATERIAL_CATEGORIES)[number])) {
      continue;
    }
    let bucket = summaryMap.get(pl);
    if (!bucket) {
      bucket = {
        id: pl,
        displayName: productLineLabel(pl),
        totalCount: 0,
        categories: [],
      };
      summaryMap.set(pl, bucket);
    }
    bucket.totalCount += count;
    bucket.categories.push({
      materialCategory: cat,
      label: MATERIAL_CATEGORY_LABELS[cat],
      count,
    });
  }

  const summaries = [...summaryMap.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "zh-Hant"),
  );

  const [itemRows] = await client.query({
    query: `
      SELECT
        customer_question,
        standard_script_idea AS standard_script,
        product_line,
        material_category,
        knowledge_source
      FROM ${fqn}
      WHERE ${where}
      ORDER BY product_line, material_category, customer_question
      LIMIT @limit
    `,
    params: { ...params, limit },
  });

  const [countRows] = await client.query({
    query: `
      SELECT COUNT(*) AS cnt
      FROM ${fqn}
      WHERE ${where}
    `,
    params,
  });
  const total = Number((countRows as { cnt?: number }[])?.[0]?.cnt ?? 0);

  const items: RoleplayMaterialItem[] = [];
  for (const row of itemRows as Record<string, unknown>[]) {
    const question = String(row.customer_question ?? "").trim();
    if (!question) continue;
    const pl = String(row.product_line ?? "_common").trim() || "_common";
    const cat = normalizeCategory(row.material_category);
    if (!ROLEPLAY_MATERIAL_CATEGORIES.includes(cat as (typeof ROLEPLAY_MATERIAL_CATEGORIES)[number])) {
      continue;
    }
    const script = String(row.standard_script ?? "").trim();
    items.push({
      id: materialId(pl, cat, question),
      productLine: pl,
      productLineLabel: productLineLabel(pl),
      materialCategory: cat,
      materialCategoryLabel: MATERIAL_CATEGORY_LABELS[cat],
      question,
      script,
      scriptPreview: script.length > 160 ? `${script.slice(0, 160)}…` : script,
      knowledgeSource: String(row.knowledge_source ?? "").trim() || undefined,
    });
  }

  return {
    productLines: listActiveProductLines().map((p) => ({
      id: p.id,
      displayName: p.displayName,
    })),
    summaries,
    items,
    total,
    filters: { productLine, materialCategory },
  };
}
