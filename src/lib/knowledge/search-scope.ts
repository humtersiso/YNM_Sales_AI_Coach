import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { listActiveProductLines } from "@/lib/ingest/contracts/training-product-registry";

export type KnowledgeSearchScope = {
  productLine?: string | null;
  /** 管理後台／env 篩選；檢索時僅作軟加分，不作 SQL 硬過濾 */
  materialCategory?: MaterialCategory | null;
  /** 分類器建議的素材類別（軟加分） */
  preferredMaterialCategory?: MaterialCategory | null;
};

/** 檢索排序用的偏好類別（兼容舊 materialCategory 欄位） */
export function getPreferredMaterialCategory(
  scope: KnowledgeSearchScope,
): MaterialCategory | null {
  const raw =
    scope.preferredMaterialCategory ?? scope.materialCategory ?? null;
  return raw?.trim() ? (raw.trim() as MaterialCategory) : null;
}

/** 銷售助手預設車款（UI 不選車款時由後端套用） */
export function getDefaultSalesProductLine(): string {
  return (process.env.SALES_CHAT_PRODUCT_LINE ?? "").trim() || "xtrail-ice";
}

export function getSalesChatScopeFromEnv(): KnowledgeSearchScope {
  const productLine = getDefaultSalesProductLine();
  const raw = (process.env.SALES_CHAT_MATERIAL_CATEGORY ?? "").trim();
  const materialCategory = raw ? (raw as MaterialCategory) : null;
  return { productLine, materialCategory };
}

export type KnowledgeMetaResponse = {
  productLines: { id: string; displayName: string }[];
  defaultProductLine: string | null;
};

export function getKnowledgeMetaForClient(): KnowledgeMetaResponse {
  const lines = listActiveProductLines().map((p) => ({
    id: p.id,
    displayName: p.displayName,
  }));
  const defaultProductLine = getDefaultSalesProductLine();

  return {
    productLines: lines,
    defaultProductLine,
  };
}
