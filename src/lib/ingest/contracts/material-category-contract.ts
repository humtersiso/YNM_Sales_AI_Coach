/**
 * 素材類別：同一車款下的本品資訊 vs 競品比較 vs 話術（分開檢索、分開 UI）。
 */
export const MATERIAL_CATEGORIES = [
  "product_info",
  "competitor_compare",
  "sales_script",
  "general",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  product_info: "本品資訊",
  competitor_compare: "競品比較",
  sales_script: "話術",
  general: "其他",
};

/** 目錄名稱別名 → material_category */
const FOLDER_ALIASES: { category: MaterialCategory; patterns: RegExp[] }[] = [
  {
    category: "product_info",
    patterns: [/^product[-_]?info$/i, /^本品/, /^產品/, /^product$/i],
  },
  {
    category: "competitor_compare",
    patterns: [/^competitor/i, /^競品/, /^compare$/i, /^comparison$/i, /^比較/],
  },
  {
    category: "sales_script",
    patterns: [/^sales[-_]?script$/i, /^script$/i, /^話術/, /^drill/i],
  },
];

export function normalizeMaterialCategory(raw: string): MaterialCategory {
  const v = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if ((MATERIAL_CATEGORIES as readonly string[]).includes(v)) return v as MaterialCategory;
  return "general";
}

/**
 * 從相對路徑推斷類別。
 * 慣例：{product_line}/product-info/… 或 competitor-compare/…
 */
export function inferMaterialCategory(
  relativePath: string,
  productLine: string,
  options?: { defaultCategory?: MaterialCategory },
): MaterialCategory {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  let segment = "";
  if (parts.length >= 2 && parts[0].toLowerCase().replace(/\s+/g, "-") === productLine) {
    segment = parts[1];
  } else if (parts.length >= 1) {
    segment = parts[0];
  }
  const norm = segment.toLowerCase().replace(/\s+/g, "-");
  for (const { category, patterns } of FOLDER_ALIASES) {
    if (patterns.some((p) => p.test(norm))) return category;
  }
  return options?.defaultCategory ?? "general";
}
