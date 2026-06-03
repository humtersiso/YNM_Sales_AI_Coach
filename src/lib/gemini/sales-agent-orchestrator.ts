import type { KnowledgeSearchScope } from "@/lib/knowledge/search-scope";
import { searchKnowledgeByPlan } from "@/lib/gemini/knowledge-search-planned";
import { buildKnowledgeReply } from "@/lib/gemini/knowledge-reply";
import { streamIntroFromCitations, summarizeCitationsWithGemini } from "@/lib/gemini/gemini-summarize";
import { prepareCitationCards } from "@/lib/gemini/citation-utils";
import { notInQuestionBankMessage, type ScriptCitation } from "@/lib/gemini/reply-format";
import {
  resolveSearchPlanWithProfile,
  type KnowledgeSearchPlan,
} from "@/lib/gemini/sales-intent-router";
import type { SalesQuestionProfile } from "@/lib/gemini/sales-question-profile";
import type { SalesChatResult, SalesChatStreamEvent } from "@/lib/gemini/sales-chat-types";
import {
  detectInactiveProductLine,
  inactiveProductLineMessage,
} from "@/lib/gemini/inactive-product-guard";
import { assessSalesQueryAnswerability } from "@/lib/gemini/query-relevance-guard";
import { isSpecQuestion } from "@/lib/gemini/sales-question-profile";
import { outOfScopeKnowledgeMessage } from "@/lib/gemini/reply-format";

export type { SalesChatStreamEvent, KnowledgeSearchPlan };

export async function resolveSearchPlan(
  message: string,
  scope: KnowledgeSearchScope,
): Promise<KnowledgeSearchPlan> {
  const { plan } = await resolveSearchPlanWithProfile(message, scope);
  return plan;
}

export { resolveSearchPlanWithProfile };

function noMatch(message: string): SalesChatResult {
  return {
    reply: notInQuestionBankMessage(),
    bullets: [],
    citations: [],
    inQuestionBank: false,
    allowAddRequest: true,
    question: message,
  };
}

function success(intro: string, bullets: string[], rawCitations: ScriptCitation[]): SalesChatResult {
  const prep = prepareCitationCards(rawCitations);
  return {
    reply: intro,
    bullets,
    citations: prep.cards,
    citationsOverflow: prep.overflowCount > 0 ? prep.overflowCount : undefined,
    inQuestionBank: true,
  };
}

/**
 * Agent 模式：規則 / Function Calling 分流 → 固定 BQ SQL → Gemini 摘要（不用 Data Agent）
 */
export async function chatWithSalesAgent(
  message: string,
  scope: KnowledgeSearchScope = {},
): Promise<SalesChatResult> {
  const inactiveProduct = detectInactiveProductLine(message, scope);
  if (inactiveProduct) {
    return { ...noMatch(message), reply: inactiveProductLineMessage(inactiveProduct) };
  }

  const { plan, profile } = await resolveSearchPlanWithProfile(message, scope);

  const preCheck = assessSalesQueryAnswerability(message, []);
  if (!preCheck.ok && preCheck.userReply) {
    return {
      reply: preCheck.userReply,
      bullets: [],
      citations: [],
      inQuestionBank: false,
      allowAddRequest: true,
      question: message,
    };
  }

  if (plan.intent === "off_topic") {
    return {
      reply: "此問題與汽車銷售知識庫無關，目前無法回答。若有 X-TRAIL、競品或話術相關問題，歡迎再問。",
      bullets: [],
      citations: [],
      inQuestionBank: false,
      allowAddRequest: false,
      question: message,
    };
  }

  let citations: ScriptCitation[] = [];
  try {
    citations = await searchKnowledgeByPlan(message, plan, profile);
  } catch (e) {
    console.error("Planned BQ search failed", e);
    return noMatch(message);
  }

  if (citations.length === 0) return noMatch(message);

  const answerability = assessSalesQueryAnswerability(message, citations, {
    questionCategory: profile.category,
  });
  if (!answerability.ok && !isSpecQuestion(message, profile)) {
    return {
      reply: answerability.userReply ?? outOfScopeKnowledgeMessage(answerability.unknownTerms),
      bullets: [],
      citations: [],
      inQuestionBank: false,
      allowAddRequest: true,
      question: message,
    };
  }

  try {
    const gemini = await summarizeCitationsWithGemini(message, citations, profile);
    if (gemini && gemini.bullets.length > 0) {
      const intro = gemini.intro || buildKnowledgeReply(message, citations).intro;
      return success(intro, gemini.bullets, citations);
    }
  } catch (e) {
    console.error("Gemini summarize failed in agent mode", e);
  }

  const local = buildKnowledgeReply(message, citations);
  if (local.bullets.length === 0) return noMatch(message);
  return success(local.intro, local.bullets, citations);
}

/** 串流：先吐 intro 打字，再回傳完整 bullets */
export async function* streamSalesAgentChat(
  message: string,
  scope: KnowledgeSearchScope = {},
): AsyncGenerator<SalesChatStreamEvent> {
  yield { type: "status", text: "正在理解問題…" };

  const inactiveProduct = detectInactiveProductLine(message, scope);
  if (inactiveProduct) {
    yield {
      type: "done",
      result: { ...noMatch(message), reply: inactiveProductLineMessage(inactiveProduct) },
    };
    return;
  }

  const { plan, profile } = await resolveSearchPlanWithProfile(message, scope);

  const preCheck = assessSalesQueryAnswerability(message, []);
  if (!preCheck.ok && preCheck.userReply) {
    yield {
      type: "done",
      result: {
        reply: preCheck.userReply,
        bullets: [],
        citations: [],
        inQuestionBank: false,
        allowAddRequest: true,
        question: message,
      },
    };
    return;
  }

  if (plan.intent === "off_topic") {
    yield {
      type: "done",
      result: {
        reply: "此問題與汽車銷售知識庫無關，目前無法回答。",
        bullets: [],
        citations: [],
        inQuestionBank: false,
        allowAddRequest: false,
        question: message,
      },
    };
    return;
  }

  yield { type: "status", text: "正在查詢知識庫…" };

  let citations: ScriptCitation[] = [];
  try {
    citations = await searchKnowledgeByPlan(message, plan, profile);
  } catch {
    yield { type: "error", message: "知識庫查詢失敗" };
    yield { type: "done", result: noMatch(message) };
    return;
  }

  if (citations.length === 0) {
    yield { type: "done", result: noMatch(message) };
    return;
  }

  const answerability = assessSalesQueryAnswerability(message, citations, {
    questionCategory: profile.category,
  });
  if (!answerability.ok && !isSpecQuestion(message, profile)) {
    yield {
      type: "done",
      result: {
        reply: answerability.userReply ?? outOfScopeKnowledgeMessage(answerability.unknownTerms),
        bullets: [],
        citations: [],
        inQuestionBank: false,
        allowAddRequest: true,
        question: message,
      },
    };
    return;
  }

  yield { type: "status", text: `已找到 ${citations.length} 筆相關內容，正在整理…` };

  try {
    for await (const delta of streamIntroFromCitations(message, citations, profile)) {
      yield { type: "intro_delta", text: delta };
    }
  } catch (e) {
    console.error("Intro stream failed", e);
  }

  try {
    const gemini = await summarizeCitationsWithGemini(message, citations, profile);
    if (gemini && gemini.bullets.length > 0) {
      yield {
        type: "done",
        result: success(gemini.intro || "", gemini.bullets, citations),
      };
      return;
    }
  } catch (e) {
    console.error("Summarize failed in stream", e);
  }

  const local = buildKnowledgeReply(message, citations);
  yield {
    type: "done",
    result: success(local.intro, local.bullets, citations),
  };
}
