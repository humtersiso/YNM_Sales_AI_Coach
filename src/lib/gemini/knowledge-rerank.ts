import { questionSimilarity } from "@/lib/analytics/question-dedup";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import type { ScoredKnowledgeHit } from "@/lib/gemini/knowledge-search";
import { scriptNumericDensity } from "@/lib/gemini/citation-prioritize";
import { isCostDetailQuery } from "@/lib/gemini/cost-query-expand";
import { citationDisplayTitle, extractFileHints } from "@/lib/gemini/knowledge-search";
import { extractMentionedCompetitor } from "@/lib/gemini/sales-question-profile";
import {
  getPreferredMaterialCategory,
  type KnowledgeSearchScope,
} from "@/lib/knowledge/search-scope";

export type RerankedKnowledgeHit = ScoredKnowledgeHit & {
  rerankScore: number;
};

const CATEGORY_BOOST = 10;
const PRODUCT_LINE_BOOST = 5;
const SCRIPT_WEIGHT = 100;
const QUESTION_WEIGHT = 40;
const TITLE_WEIGHT = 25;

const SPEC_QUERY =
  /馬力|扭力|功率|油耗|幾公升|km\/l|續航|軸距|車長|車寬|幾匹|多少ps|規格|配備有/i;

/**
 * 合併 BQ relevance、內文/檢索欄相似度、category/product 軟加分後重排序。
 * PDF/PPT 以 standard_script 為主；customer_question 為檢索摘要欄。
 */
export function rerankKnowledgeHits(
  message: string,
  hits: ScoredKnowledgeHit[],
  scope: KnowledgeSearchScope,
  preferredCategory?: MaterialCategory | null,
): RerankedKnowledgeHit[] {
  const pref = preferredCategory ?? getPreferredMaterialCategory(scope);
  const productLine = scope.productLine?.trim() ?? null;
  const isSpec = SPEC_QUERY.test(message);
  const isCost = isCostDetailQuery(message);

  return hits
    .map((hit) => {
      const scriptHead = (hit.standard_script ?? "").slice(0, 2200);
      const scriptSim = questionSimilarity(message, scriptHead) * SCRIPT_WEIGHT;
      const questionSim =
        questionSimilarity(message, hit.customer_question ?? "") * QUESTION_WEIGHT;
      const titleText = citationDisplayTitle(hit);
      const titleSim = questionSimilarity(message, titleText) * TITLE_WEIGHT;

      let numericBoost = 0;
      if (isSpec && /\d/.test(scriptHead)) {
        numericBoost += 6;
        if (/ps|kgm|km\/l|匹|公斤米/i.test(scriptHead)) numericBoost += 4;
        if (/x-?trail/i.test(scriptHead) && /204\s*ps/i.test(scriptHead)) numericBoost += 22;
        if (/x-?trail/i.test(scriptHead) && /30\.6\s*kgm/i.test(scriptHead)) numericBoost += 16;
      }
      if (isSpec && /媒體報導|試駕簡報/i.test(titleText) && !/\d+\s*ps/i.test(scriptHead)) {
        numericBoost -= 8;
      }
      if (isCost) {
        numericBoost += scriptNumericDensity(scriptHead) * 3;
        if (scriptNumericDensity(scriptHead) < 2) numericBoost -= 15;
      }
      if (/晃|暈車|暈/i.test(message)) {
        if (/晃|吸震|懸吊|韌性|重心|傾斜/i.test(scriptHead)) numericBoost += 18;
        if (/劇院級|座椅.*短|空間靈活|不太好坐/i.test(scriptHead) && !/晃|吸震/i.test(scriptHead)) {
          numericBoost -= 14;
        }
        if (/試乘起來後座|後座都感覺很晃/i.test(hit.customer_question ?? "")) numericBoost += 12;
      }

      for (const hint of extractFileHints(message)) {
        const esc = hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(esc, "i").test(`${titleText} ${scriptHead}`)) numericBoost += 14;
      }
      const competitor = extractMentionedCompetitor(message);
      if (
        competitor &&
        new RegExp(competitor.replace(/\s+/g, "\\s*"), "i").test(`${titleText} ${scriptHead}`)
      ) {
        numericBoost += 32;
      } else if (competitor) {
        numericBoost -= 12;
      }

      const catBoost = pref && hit.material_category === pref ? CATEGORY_BOOST : 0;
      const plBoost = productLine && hit.product_line === productLine ? PRODUCT_LINE_BOOST : 0;
      const rerankScore =
        hit.bqRelevance + scriptSim + questionSim + titleSim + numericBoost + catBoost + plBoost;
      return { ...hit, rerankScore };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
}

/** Reciprocal Rank Fusion：合併多通道排序結果 */
export function reciprocalRankFusion(
  rankedLists: ScoredKnowledgeHit[][],
  k = 60,
): ScoredKnowledgeHit[] {
  const scores = new Map<string, { hit: ScoredKnowledgeHit; score: number }>();

  for (const list of rankedLists) {
    list.forEach((hit, rank) => {
      const key = `${hit.customer_question?.trim().toLowerCase()}::${hit.source_locator ?? ""}`;
      const rrf = 1 / (k + rank + 1);
      const prev = scores.get(key);
      if (prev) {
        prev.score += rrf;
        if (hit.bqRelevance > prev.hit.bqRelevance) prev.hit = hit;
      } else {
        scores.set(key, { hit, score: rrf });
      }
    });
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ hit, score }) => ({ ...hit, bqRelevance: hit.bqRelevance + score * 10 }));
}
