import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import type { KnowledgeSearchScope } from "@/lib/knowledge/search-scope";
import {
  classifySalesQuestion,
  mergeProfileWithScope,
} from "@/lib/gemini/sales-question-profile";

/** @deprecated 請改用 sales-question-profile */
export function inferProductLineFromMessage(message: string): string | null {
  const { scope } = mergeProfileWithScope(message, {});
  return scope.productLine ?? null;
}

/** @deprecated 請改用 classifySalesQuestion */
export function inferMaterialCategoryFromMessage(message: string): MaterialCategory | null {
  return classifySalesQuestion(message).materialCategory;
}

/** 合併 UI scope 與問句分類結果 */
export function mergeScopeWithMessage(
  message: string,
  userScope: KnowledgeSearchScope,
): KnowledgeSearchScope {
  return mergeProfileWithScope(message, userScope).scope;
}

export { classifySalesQuestion, mergeProfileWithScope };
