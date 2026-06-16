import type { RoleplayAgeRange, RoleplayDrillDifficulty } from "@/lib/roleplay/scenario-contract";
import { ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";
import {
  getRoleplayRagSupportedProducts,
  isRoleplayProductRagReady,
} from "@/lib/roleplay/roleplay-rag-products";

export const ROLEPLAY_AGE_RANGES: { id: RoleplayAgeRange; label: string }[] = [
  { id: "20-30", label: "20–30 歲" },
  { id: "30-40", label: "30–40 歲" },
  { id: "40-50", label: "40–50 歲" },
  { id: "50+", label: "50 歲以上" },
];

export const ROLEPLAY_DIFFICULTIES: {
  id: RoleplayDrillDifficulty;
  label: string;
  hint: string;
}[] = [
  { id: "beginner", label: "新手", hint: "1～2 個疑慮後較易接受" },
  { id: "advanced", label: "進階", hint: "說服後仍提出新疑慮" },
  { id: "challenge", label: "挑戰", hint: "強硬、要求具體數字" },
];

/**
 * X-TRAIL 對練競品探測候選（須有 competitor_compare 語料；實際可選清單以 RAG 探測為準）
 * 對照 data/training-materials-inventory.json、retrieval-gold.json 之 competitor-compare 檔名
 */
export const ROLEPLAY_COMPETITORS_XTRAIL = [
  "Toyota RAV4",
  "Hyundai Tucson L",
  "KIA Sportage",
  "Ford Kuga",
  "Hyundai MUFASA",
  "Ford Territory",
  "Mitsubishi XFORCE",
] as const;

export type RoleplayCompetitorId = (typeof ROLEPLAY_COMPETITORS_XTRAIL)[number];

/** 語料候選清單（設定頁即時顯示；開局時由 RAG 覆蓋檢查驗證） */
export function staticCompetitorsForProduct(productLine: string): string[] {
  if (!isRoleplayProductRagReady(productLine)) return [];
  return [...ROLEPLAY_COMPETITORS_XTRAIL];
}

function buildStaticRoleplayConfigOptions() {
  const rag = getRoleplayRagSupportedProducts();
  const products = rag.products.map((p) => ({ id: p.id, displayName: p.displayName }));

  const personas = ROLEPLAY_GLOBAL_CONFIG.personas
    .filter((p) => p.id.startsWith("P-"))
    .map((p) => ({
      id: p.id,
      name: p.name,
      style: p.style,
      traits: p.traits,
      decisionMode: p.decisionMode,
    }));

  return {
    products,
    personas,
    ageRanges: ROLEPLAY_AGE_RANGES,
    difficulties: ROLEPLAY_DIFFICULTIES,
    maxTurns: { min: 3, max: 10, default: 5 },
  };
}

/** @deprecated 請改用 getRoleplayConfigOptions */
export function getRoleplayConfigOptionsSync() {
  const base = buildStaticRoleplayConfigOptions();
  const competitorsByProduct: Record<string, string[]> = {};
  for (const p of base.products) {
    competitorsByProduct[p.id] = staticCompetitorsForProduct(p.id);
  }
  const defaultProduct = base.products[0]?.id;
  return {
    ...base,
    competitors: defaultProduct ? (competitorsByProduct[defaultProduct] ?? []) : [],
    competitorsByProduct,
  };
}

export async function getRoleplayConfigOptions() {
  const base = buildStaticRoleplayConfigOptions();
  const competitorsByProduct: Record<string, string[]> = {};

  for (const p of base.products) {
    competitorsByProduct[p.id] = staticCompetitorsForProduct(p.id);
  }

  const defaultProduct = base.products[0]?.id;
  const competitors = defaultProduct
    ? (competitorsByProduct[defaultProduct] ?? [])
    : [];

  return {
    ...base,
    competitors,
    competitorsByProduct,
  };
}

export function isAllowedProductLine(id: string): boolean {
  return isRoleplayProductRagReady(id);
}

export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function clampTurns(n: number): number {
  const min = 3;
  const max = 10;
  if (!Number.isFinite(n)) return 5;
  return Math.min(max, Math.max(min, Math.round(n)));
}
