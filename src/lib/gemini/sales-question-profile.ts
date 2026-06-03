import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { getProductLine } from "@/lib/ingest/contracts/training-product-registry";
import type { KnowledgeSearchScope } from "@/lib/knowledge/search-scope";
import { getDefaultSalesProductLine } from "@/lib/knowledge/search-scope";

/** 業代問題三類（後端隱藏，不送前端） */
export type SalesQuestionCategory = "own_product" | "competitor" | "sales_qa";

export type SalesQuestionProfile = {
  category: SalesQuestionCategory;
  materialCategory: MaterialCategory;
  /** 規則分類信心；低信心時可觸發查詢改寫 */
  confidence: "high" | "low";
  heroProduct: { id: string; displayName: string };
  mentionedCompetitor: string | null;
  routedBy: "rules" | "gemini_tool";
};

const OFF_TOPIC =
  /^(今天|明天)?(天氣|氣溫|溫度|下雨|降雨|颱風)|幾度|要不要帶傘|穿什麼衣服/i;

const COMPETITOR_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /tucson\s*l?|途勝|土尚/i, label: "TUCSON L" },
  { pattern: /territory|福特\s*territory/i, label: "Territory" },
  { pattern: /\bford\b|福特(?!territory)/i, label: "Ford" },
  { pattern: /sportage/i, label: "Sportage" },
  { pattern: /rav4|cr-?v/i, label: "RAV4" },
  { pattern: /kuga/i, label: "Kuga" },
  { pattern: /mufasa/i, label: "Mufasa" },
  { pattern: /x-?\s*force|xforce/i, label: "XFORCE" },
  { pattern: /focus/i, label: "Focus" },
  { pattern: /hr-?v/i, label: "HR-V" },
  { pattern: /\bhonda\b|本田/i, label: "Honda" },
  { pattern: /\btoyota\b|豐田/i, label: "Toyota" },
  { pattern: /\byaris\b/i, label: "Yaris" },
  { pattern: /\bvenue\b/i, label: "Venue" },
  { pattern: /\bfortuner\b/i, label: "Fortuner" },
  { pattern: /\bmg\b|名爵/i, label: "MG" },
  { pattern: /納智捷|luxgen/i, label: "Luxgen" },
];

const BATTLE_WORD = /對戰|比較|競品|勝過|贏過|pk\b|對比|跟.*比|vs|相較/i;
const COST_WORD = /持有成本|保養|電池|油耗|輪胎|稅|費用|牌照|保費/i;
const QA_WORD =
  /試乘|試駕|邀約|怎麼回|話術|客戶問|客戶說|客戶擔心|可回覆|可強調|太貴|議價|殺價|折扣|優惠/i;
/** 客戶異議／感受（題庫多為 sales_script，優先於本品分類） */
const CUSTOMER_OBJECTION =
  /我覺得|不太好|不好坐|不太舒服|會有異音|異音|疑慮|擔心|缺點|抱怨|不太適合/i;
const OWN_PRODUCT_WORD =
  /lv2|lv\s*2|icc|車道置中|aeb|propilot|pfcw|eapm|智行|配備|規格|媒體|報導|評測|u-?car/i;

export function getHeroProduct(): { id: string; displayName: string } {
  const id = getDefaultSalesProductLine();
  const line = getProductLine(id);
  return { id, displayName: line?.displayName ?? "X-TRAIL ICE" };
}

export function extractMentionedCompetitor(message: string): string | null {
  for (const { pattern, label } of COMPETITOR_PATTERNS) {
    if (pattern.test(message)) return label;
  }
  return null;
}

export function mentionsHeroProduct(message: string): boolean {
  return /x-?trail|xtrail|勁客|\bkicks\b/i.test(message);
}

export function mentionsCompetitor(message: string): boolean {
  return extractMentionedCompetitor(message) !== null;
}

export function salesCategoryToMaterialCategory(
  category: SalesQuestionCategory,
): MaterialCategory {
  if (category === "competitor") return "competitor_compare";
  if (category === "sales_qa") return "sales_script";
  return "product_info";
}

export function materialCategoryToSalesCategory(
  cat: MaterialCategory | null | undefined,
): SalesQuestionCategory | null {
  if (cat === "competitor_compare") return "competitor";
  if (cat === "sales_script") return "sales_qa";
  if (cat === "product_info") return "own_product";
  return null;
}

export function isOffTopicMessage(message: string): boolean {
  const t = message.trim();
  if (!t) return true;
  return OFF_TOPIC.test(t) && !/車|駕|行|x-?trail|kicks|安全|aeb|propilot|lv2/i.test(t);
}

/** 規則分類（同步、<1ms） */
export function classifySalesQuestionByRules(message: string): SalesQuestionProfile {
  const t = message.trim();
  const heroProduct = getHeroProduct();
  const competitor = extractMentionedCompetitor(t);
  const hasBattle = BATTLE_WORD.test(t);
  const hasCost = COST_WORD.test(t);
  const hasQa = QA_WORD.test(t) || CUSTOMER_OBJECTION.test(t);
  const hasOwn = OWN_PRODUCT_WORD.test(t);
  const hasHero = mentionsHeroProduct(t);

  let category: SalesQuestionCategory;

  if (hasQa && !competitor && !hasBattle) {
    category = "sales_qa";
  } else if (
    competitor ||
    hasBattle ||
    (hasCost && competitor) ||
    (/tucson|途勝/i.test(t) && hasCost) ||
    (/tucson|途勝|territory|sportage|rav4|cr-?v/i.test(t) && !hasHero)
  ) {
    category = "competitor";
  } else if (hasOwn || hasHero) {
    category = "own_product";
  } else if (hasCost) {
    category = "competitor";
  } else if (hasQa) {
    category = "sales_qa";
  } else {
    category = "own_product";
  }

  const confidence = inferClassificationConfidence({
    category,
    hasQa,
    hasOwn,
    hasHero,
    competitor,
    hasBattle,
    hasCost,
  });

  return {
    category,
    materialCategory: salesCategoryToMaterialCategory(category),
    confidence,
    heroProduct,
    mentionedCompetitor: category === "competitor" ? competitor : null,
    routedBy: "rules",
  };
}

function inferClassificationConfidence(input: {
  category: SalesQuestionCategory;
  hasQa: boolean;
  hasOwn: boolean;
  hasHero: boolean;
  competitor: string | null;
  hasBattle: boolean;
  hasCost: boolean;
}): "high" | "low" {
  const { category, hasQa, hasOwn, hasHero, competitor, hasBattle, hasCost } = input;
  if (competitor || hasBattle || hasQa || hasCost) return "high";
  if (category === "own_product" && (hasOwn || hasHero)) return "high";
  if (category === "own_product") return "low";
  return "high";
}

export function classifySalesQuestion(
  message: string,
  _scope: KnowledgeSearchScope = {},
): SalesQuestionProfile {
  return classifySalesQuestionByRules(message);
}

/** 將分類結果併入 BQ 檢索 scope */
export function applyProfileToScope(
  scope: KnowledgeSearchScope,
  profile: SalesQuestionProfile,
  message = "",
): KnowledgeSearchScope {
  let productLine = scope.productLine ?? profile.heroProduct.id;

  if (message && /kicks|勁客/i.test(message)) {
    productLine = "kicks";
  } else if (message && mentionsHeroProduct(message)) {
    productLine = profile.heroProduct.id;
  }

  return {
    productLine,
    preferredMaterialCategory: profile.materialCategory,
  };
}

/** Gemini FC 回傳的 material_category 更新 profile */
export function profileFromMaterialCategory(
  cat: MaterialCategory,
  message: string,
  routedBy: "rules" | "gemini_tool" = "gemini_tool",
): SalesQuestionProfile {
  const mapped = materialCategoryToSalesCategory(cat) ?? classifySalesQuestionByRules(message).category;
  const base = classifySalesQuestionByRules(message);
  return {
    category: mapped,
    materialCategory: salesCategoryToMaterialCategory(mapped),
    confidence: base.confidence,
    heroProduct: base.heroProduct,
    mentionedCompetitor:
      mapped === "competitor" ? extractMentionedCompetitor(message) : null,
    routedBy,
  };
}

export function mergeProfileWithScope(
  message: string,
  userScope: KnowledgeSearchScope,
): { profile: SalesQuestionProfile; scope: KnowledgeSearchScope } {
  const profile = classifySalesQuestion(message, userScope);
  const scope = applyProfileToScope(
    {
      productLine: userScope.productLine ?? profile.heroProduct.id,
      preferredMaterialCategory:
        userScope.preferredMaterialCategory ??
        userScope.materialCategory ??
        profile.materialCategory,
    },
    profile,
    message,
  );
  return { profile, scope };
}

/** dev 除錯用；不在 API 回傳 */
export function logSalesQuestionProfile(message: string, profile: SalesQuestionProfile): void {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[sales] profile", {
    category: profile.category,
    confidence: profile.confidence,
    materialCategory: profile.materialCategory,
    hero: profile.heroProduct.displayName,
    competitor: profile.mentionedCompetitor,
    routedBy: profile.routedBy,
    q: message.slice(0, 48),
  });
}
