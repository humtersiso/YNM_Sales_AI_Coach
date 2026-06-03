import type { ScoredKnowledgeHit } from "@/lib/gemini/knowledge-search";
import { isCostDetailQuery } from "@/lib/gemini/cost-query-expand";
import { isSpecNumericQuery } from "@/lib/gemini/spec-query-expand";

/** 摘錄內可核對的數字多寡（成本試算表、規格表） */
export function scriptNumericDensity(script: string): number {
  const t = script ?? "";
  if (!t.trim()) return 0;
  let score = 0;
  if (/\d{4,}/.test(t)) score += 3;
  if (/\d+[\d,.]*\s*萬/.test(t)) score += 4;
  if (/\d+[\d,.]*\s*元/.test(t)) score += 3;
  if (/(km\/L|km\/l|ps|kgm|mm)/i.test(t)) score += 2;
  const nums = t.match(/\d[\d,.]{2,}/g);
  score += Math.min(nums?.length ?? 0, 8);
  return score;
}

/** 表頭重複、無實際數值的列（xlsx 匯入常見） */
export function looksLikeEmptyTableLabelRow(script: string): boolean {
  const t = script.replace(/\s+/g, " ");
  if (scriptNumericDensity(t) >= 2) return false;
  if (/差異:\s*差異|用車成本:\s*X-TRAIL.*X-TRAIL\s*輕油電/i.test(t)) return true;
  if (/欄\d+:\s*差異/.test(t) && !/\d{4,}/.test(t)) return true;
  return false;
}

function specNumericBoost(script: string, title = ""): number {
  const blob = `${title} ${script}`;
  let b = 0;
  if (/\d+\s*ps\b/i.test(blob)) b += 28;
  if (/最大馬力|馬力\s*[:：]?\s*\d|\d+\s*匹/i.test(blob)) b += 22;
  if (/30\.6\s*kgm|最大扭力/i.test(blob)) b += 14;
  if (/x-?trail/i.test(blob) && /\d+\s*ps/i.test(blob)) b += 12;
  if (/媒體報導|試駕簡報|赴日|小作文/i.test(blob) && !/\d+\s*ps\b/i.test(blob)) b -= 35;
  if (/同級最寬|頭等艙|超乎想像/i.test(blob)) b -= 20;
  return b;
}

export function prioritizeHitsForQuestion<T extends ScoredKnowledgeHit>(
  message: string,
  hits: T[],
): T[] {
  const wantNumbers = isCostDetailQuery(message) || isSpecNumericQuery(message);
  if (!wantNumbers || hits.length <= 1) return hits;

  const isSpec = isSpecNumericQuery(message);

  return [...hits].sort((a, b) => {
    const emptyA = looksLikeEmptyTableLabelRow(a.standard_script ?? "") ? -50 : 0;
    const emptyB = looksLikeEmptyTableLabelRow(b.standard_script ?? "") ? -50 : 0;
    const numA = scriptNumericDensity(a.standard_script ?? "") + emptyA;
    const numB = scriptNumericDensity(b.standard_script ?? "") + emptyB;
    const specA = isSpec ? specNumericBoost(a.standard_script ?? "", a.title ?? a.customer_question ?? "") : 0;
    const specB = isSpec ? specNumericBoost(b.standard_script ?? "", b.title ?? b.customer_question ?? "") : 0;
    const totalA = numA + specA;
    const totalB = numB + specB;
    if (totalB !== totalA) return totalB - totalA;
    const scoreB = (b as ScoredKnowledgeHit & { rerankScore?: number }).rerankScore ?? b.bqRelevance;
    const scoreA = (a as ScoredKnowledgeHit & { rerankScore?: number }).rerankScore ?? a.bqRelevance;
    return scoreB - scoreA;
  });
}
