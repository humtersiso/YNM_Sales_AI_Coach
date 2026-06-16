import { getProductLine } from "@/lib/ingest/contracts/training-product-registry";
import type { KnowledgeSearchScope } from "@/lib/knowledge/search-scope";

const MENTION_PATTERNS: { id: string; pattern: RegExp }[] = [
  { id: "kicks", pattern: /\bkicks\b|勁客/i },
];

const CROSS_PRODUCT_COMPARE =
  /跟|和|與|及|vs|相比|對比|比較|都有|差在|差異|差多少|哪裡不同|哪個|哪台|哪一款/i;

/** 問句同時比較兩個本品車系（如 KICKS vs X-TRAIL） */
export function isCrossOwnProductLineComparison(message: string): boolean {
  const hasKicks = /\bkicks\b|勁客/i.test(message);
  const hasXtrail = /x-?trail|xtrail/i.test(message);
  return hasKicks && hasXtrail && CROSS_PRODUCT_COMPARE.test(message);
}

/** 題庫尚未匯入的 inactive 車款；回傳顯示名稱 */
export function detectInactiveProductLine(
  message: string,
  scope: KnowledgeSearchScope = {},
): string | null {
  if (scope.productLine?.trim()) {
    const pl = getProductLine(scope.productLine);
    if (pl && !pl.active) return pl.displayName;
  }

  for (const { id, pattern } of MENTION_PATTERNS) {
    if (!pattern.test(message)) continue;
    const pl = getProductLine(id);
    if (pl && !pl.active) return pl.displayName;
  }

  return null;
}

export function inactiveProductLineMessage(
  displayName: string,
  options?: { comparison?: boolean },
): string {
  if (options?.comparison) {
    return `目前知識庫尚無「${displayName}」的建檔話術，無法與其他車款進行配備或規格比較。請改問 X-TRAIL ICE 或已收錄競品。`;
  }
  return `目前知識庫尚無「${displayName}」的建檔話術，請改問 X-TRAIL ICE 或已收錄競品／話術主題。`;
}

/** 檢索前／後皆可呼叫：inactive 車款或無法比較時回傳使用者文案 */
export function resolveInactiveProductBlock(
  message: string,
  scope: KnowledgeSearchScope = {},
): string | null {
  const inactive = detectInactiveProductLine(message, scope);
  if (!inactive) return null;
  const comparison = isCrossOwnProductLineComparison(message);
  return inactiveProductLineMessage(inactive, { comparison });
}
