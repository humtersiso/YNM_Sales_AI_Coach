import { questionSimilarity } from "@/lib/analytics/question-dedup";
import { extractFileHints, extractSearchKeywords } from "@/lib/gemini/knowledge-search";
import { extractMentionedCompetitor, isSpecQuestion } from "@/lib/gemini/sales-question-profile";
import { blobContainsTerm, hanFold } from "@/lib/gemini/han-fold";
import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { outOfScopeKnowledgeMessage } from "@/lib/gemini/reply-format";

/** 明顯非題庫／惡搞 */
const BLOCKLIST = [/\bufo\b/i, /飛碟|外星人|外星/];

const MIN_SIMILARITY = 0.1;
const MIN_SIMILARITY_SHORT = 0.16;

function citationMatchScore(message: string, c: ScriptCitation): number {
  const qSim = questionSimilarity(message, c.question);
  const scriptSim = questionSimilarity(message, (c.script ?? "").slice(0, 1200));
  return Math.max(qSim, scriptSim);
}

/** 檢索結果與問句字串相似度 */
export function passesCitationRelevanceGate(
  message: string,
  citations: ScriptCitation[],
): boolean {
  if (citations.length === 0) return false;
  const q = message.trim();
  if (!q) return false;

  const scores = citations.slice(0, 8).map((c) => citationMatchScore(q, c));
  const maxSim = Math.max(...scores);
  const threshold = q.length <= 12 ? MIN_SIMILARITY_SHORT : MIN_SIMILARITY;
  return maxSim >= threshold;
}

/**
 * 引用是否「 grounded 」於問句：摘錄／檔名含問句關鍵詞或已辨識競品。
 * 取代硬編碼車款白名單 — 以檢索結果為準。
 */
function citationsGroundedInQuery(message: string, citations: ScriptCitation[]): boolean {
  const blob = citations
    .slice(0, 6)
    .map((c) => `${c.question}\n${c.script}`)
    .join("\n");

  const competitor = extractMentionedCompetitor(message);
  if (competitor) {
    const compNeed = hanFold(competitor).replace(/\s/g, "");
    const compHay = hanFold(blob).replace(/\s/g, "");
    if (!compHay.includes(compNeed)) return false;
  }

  for (const hint of extractFileHints(message)) {
    if (blobContainsTerm(blob, hint)) return true;
  }

  const keys = extractSearchKeywords(message).filter((k) => k.length >= 2);
  if (keys.length === 0) return true;

  const hit = keys.filter((k) => blobContainsTerm(blob, k));
  if (hit.length >= 1 && hit.length / keys.length >= 0.15) return true;

  for (const term of message.match(/[\u4e00-\u9fff]{2,4}/g) ?? []) {
    if (term.length >= 2 && blobContainsTerm(blob, term)) return true;
  }

  return false;
}

export type SalesAnswerability = {
  ok: boolean;
  userReply?: string;
  unknownTerms?: string[];
};

export type SalesAnswerabilityOptions = {
  questionCategory?: "own_product" | "competitor" | "sales_qa" | "spec";
};

/**
 * 可答性判斷（根源版）：
 * 1. 檢索前：只擋黑名單，不維護車款白名單
 * 2. 檢索後：有引用且（相似度 OK 或 引用 grounded 於問句關鍵詞）
 */
export function assessSalesQueryAnswerability(
  message: string,
  citations: ScriptCitation[],
  options?: SalesAnswerabilityOptions,
): SalesAnswerability {
  if (BLOCKLIST.some((p) => p.test(message))) {
    return { ok: false, userReply: outOfScopeKnowledgeMessage() };
  }

  /** 規格題：不套用話術白名單／相似度護欄，直接放行檢索 */
  if (isSpecQuestion(message, { category: options?.questionCategory })) {
    return { ok: true };
  }

  if (citations.length === 0) {
    return { ok: true };
  }

  const competitor = extractMentionedCompetitor(message);
  if (competitor || options?.questionCategory === "competitor") {
    if (citationsGroundedInQuery(message, citations)) {
      return { ok: true };
    }
    return { ok: false, userReply: outOfScopeKnowledgeMessage() };
  }

  /** QA 話術：RAG 已有足夠摘錄即視為可答（標題常只是 PDF 名） */
  if (
    options?.questionCategory === "sales_qa" &&
    citations.some((c) => (c.script?.trim().length ?? 0) >= 36)
  ) {
    return { ok: true };
  }

  if (passesCitationRelevanceGate(message, citations)) {
    return { ok: true };
  }

  if (citationsGroundedInQuery(message, citations)) {
    return { ok: true };
  }

  return {
    ok: false,
    userReply: outOfScopeKnowledgeMessage(),
  };
}

/** @deprecated 不再用白名單擋題；保留供舊測試／除錯 */
export function detectUnknownKnowledgeSubjects(_message: string): string[] | null {
  return null;
}
