import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { augmentCostQueryForSearch, isCostDetailQuery } from "@/lib/gemini/cost-query-expand";
import {
  augmentSpecQueryForSearch,
  isSpecNumericQuery,
} from "@/lib/gemini/spec-query-expand";
import type { SalesQuestionProfile } from "@/lib/gemini/sales-question-profile";
import {
  extractMentionedCompetitor,
  mentionsHeroProduct,
} from "@/lib/gemini/sales-question-profile";

const BATTLE_WORD = /對戰|比較|競品|勝過|贏過|pk\b|對比|跟.*比|vs|相較/i;
/** 同時考慮本品與競品、或問保養／油耗／成本差異 */
const CROSS_SHOP_WORD =
  /同時看|一起看|同時考慮|一併比|順便看|差多少|差異|保養.*差|油耗.*差|成本.*差|長期.*差/i;

/** 比較題：問句同時涉及本品與競品，需雙通道召回 */
export function isDualChannelComparison(message: string, profile?: SalesQuestionProfile): boolean {
  const competitor = extractMentionedCompetitor(message);
  if (!competitor) return false;
  const crossShop =
    BATTLE_WORD.test(message) || CROSS_SHOP_WORD.test(message) || isCostDetailQuery(message);
  if (profile?.category === "competitor" && (mentionsHeroProduct(message) || crossShop)) {
    return true;
  }
  return mentionsHeroProduct(message) && crossShop;
}

export type RetrievalChannel = {
  query: string;
  materialCategory: MaterialCategory;
  label: "hero" | "competitor" | "primary";
};

/** 檢索前查詢改寫：規格題補本品主體 */
export function buildPrimarySearchQuery(
  message: string,
  profile?: SalesQuestionProfile,
): string {
  const hero = profile?.heroProduct.displayName ?? "X-TRAIL ICE";
  return augmentSpecQueryForSearch(message, hero);
}

/** 雙通道比較題：本品庫 + 競品庫各查一輪 */
export function buildDualChannelComparisonQueries(
  message: string,
  profile: SalesQuestionProfile,
): RetrievalChannel[] {
  const hero = profile.heroProduct.displayName;
  const competitor = extractMentionedCompetitor(message) ?? profile.mentionedCompetitor;
  if (!competitor) return [];

  const costTerms = isCostDetailQuery(message)
    ? "長期持有成本 保養 油耗 8萬公里 16萬公里 合計 差異"
    : "";
  const specTerms = isSpecNumericQuery(message) ? "規格 馬力 扭力 油耗" : "規格 特色 配備";
  const expanded = augmentCostQueryForSearch(message);

  return [
    {
      query: `${hero} ${costTerms} ${specTerms} ${expanded}`.trim(),
      materialCategory: isCostDetailQuery(message) ? "competitor_compare" : "product_info",
      label: "hero",
    },
    {
      query: `${competitor} ${costTerms} ${specTerms} ${expanded}`.trim(),
      materialCategory: "competitor_compare",
      label: "competitor",
    },
  ];
}

/** 規格題：僅查本品規格庫 + 競品規格庫（排除話術／媒體小作文庫） */
export function isSpecRetrievalRoute(
  message: string,
  profile?: SalesQuestionProfile,
): boolean {
  return profile?.category === "spec" || isSpecNumericQuery(message);
}

/** 規格題雙通道：product_info + competitor_compare */
export function buildSpecRetrievalChannels(
  message: string,
  profile?: SalesQuestionProfile,
): RetrievalChannel[] {
  const hero = profile?.heroProduct.displayName ?? "X-TRAIL ICE";
  const query = buildPrimarySearchQuery(message, profile);
  const specTerms = "規格 最大馬力 馬力 扭力 油耗 ps kgm km/L";

  return [
    {
      query: `${hero} ${specTerms} ${query}`.trim(),
      materialCategory: "product_info",
      label: "hero",
    },
    {
      query: `${query} ${specTerms}`.trim(),
      materialCategory: "competitor_compare",
      label: "competitor",
    },
  ];
}

/** 依問題類型產生檢索通道（單通道或多通道） */
export function buildRetrievalChannels(
  message: string,
  profile?: SalesQuestionProfile,
): RetrievalChannel[] {
  if (isSpecRetrievalRoute(message, profile) && !isDualChannelComparison(message, profile)) {
    return buildSpecRetrievalChannels(message, profile);
  }

  if (profile && isDualChannelComparison(message, profile)) {
    return buildDualChannelComparisonQueries(message, profile);
  }

  const query = buildPrimarySearchQuery(message, profile);
  let category: MaterialCategory = "product_info";

  if (profile?.category === "competitor") {
    category = "competitor_compare";
  } else if (profile?.category === "sales_qa") {
    category = "sales_script";
  } else if (isSpecNumericQuery(message) && !extractMentionedCompetitor(message)) {
    category = "product_info";
  } else if (isSpecNumericQuery(message)) {
    category = "competitor_compare";
  }

  return [{ query, materialCategory: category, label: "primary" }];
}
