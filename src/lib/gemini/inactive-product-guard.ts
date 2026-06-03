import { getProductLine } from "@/lib/ingest/contracts/training-product-registry";
import type { KnowledgeSearchScope } from "@/lib/knowledge/search-scope";

const MENTION_PATTERNS: { id: string; pattern: RegExp }[] = [
  { id: "kicks", pattern: /\bkicks\b|勁客/i },
];

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

export function inactiveProductLineMessage(displayName: string): string {
  return `目前知識庫尚無「${displayName}」的建檔話術，請改問 X-TRAIL ICE 或已收錄競品／話術主題。若要納入題庫，可加入「待新增題庫清單」。`;
}
