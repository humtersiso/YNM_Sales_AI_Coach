import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";

/** 對練素材區可瀏覽的類別（話術優先，含本品與競品情境） */
export const ROLEPLAY_MATERIAL_CATEGORIES = [
  "sales_script",
  "product_info",
  "competitor_compare",
] as const;

export type RoleplayMaterialCategory = (typeof ROLEPLAY_MATERIAL_CATEGORIES)[number];

export type RoleplayMaterialItem = {
  id: string;
  productLine: string;
  productLineLabel: string;
  materialCategory: MaterialCategory;
  materialCategoryLabel: string;
  question: string;
  script: string;
  scriptPreview: string;
  knowledgeSource?: string;
};

export type RoleplayCategorySummary = {
  materialCategory: MaterialCategory;
  label: string;
  count: number;
};

export type RoleplayProductSummary = {
  id: string;
  displayName: string;
  totalCount: number;
  categories: RoleplayCategorySummary[];
};

export type RoleplayMaterialsResponse = {
  productLines: { id: string; displayName: string }[];
  summaries: RoleplayProductSummary[];
  items: RoleplayMaterialItem[];
  total: number;
  filters: {
    productLine: string | null;
    materialCategory: MaterialCategory | null;
  };
};
