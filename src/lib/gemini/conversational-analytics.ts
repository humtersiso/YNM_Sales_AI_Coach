import type { KnowledgeSearchScope } from "@/lib/knowledge/search-scope";
import { dataAgentChat } from "@/lib/gemini/gemini-client";
import { tryBuildSpecNumericReply } from "@/lib/gemini/spec-value-extract";
import {
  looksLikeTableDump,
  streamIntroFromCitations,
  summarizeCitationsWithGemini,
} from "@/lib/gemini/gemini-summarize";
import { buildKnowledgeReply } from "@/lib/gemini/knowledge-reply";
import { searchKnowledgeCitations } from "@/lib/gemini/knowledge-search";
import { searchKnowledgeByPlan } from "@/lib/gemini/knowledge-search-planned";
import {
  formatMarkdownReplyToDisplay,
  isUsableReply,
  notInQuestionBankMessage,
  sanitizeDataAgentDisplay,
  type ScriptCitation,
} from "@/lib/gemini/reply-format";
import { formatDataAgentOutputForSales } from "@/lib/gemini/data-agent-refine";
import { buildDataAgentRawPrompt } from "@/lib/gemini/sales-reply-directives";
import type { CitationCard } from "@/lib/gemini/citation-card";
import { prepareCitationCards } from "@/lib/gemini/citation-utils";
import type { SalesQuestionProfile } from "@/lib/gemini/sales-question-profile";
import {
  canUseDataAgent,
  canUseGeminiSummarize,
  isDataAgentFormatMode,
  isDataAgentRawMode,
  resolveSalesChatMode,
} from "@/lib/gemini/sales-chat-mode";
import { neverCallDataAgent, skipDataAgentWhenCitationsFound } from "@/lib/gemini/sales-chat-speed";
import { resolveInactiveProductBlock } from "@/lib/gemini/inactive-product-guard";
import { isCostDetailQuery } from "@/lib/gemini/cost-query-expand";
import { assessSalesQueryAnswerability } from "@/lib/gemini/query-relevance-guard";
import { isSpecQuestion } from "@/lib/gemini/sales-question-profile";
import { outOfScopeKnowledgeMessage } from "@/lib/gemini/reply-format";
import { RagSearchError } from "@/lib/rag/discovery-engine-search";
import { isRagKnowledgeBackend } from "@/lib/knowledge/knowledge-backend";
import {
  chatWithVertexRagGrounding,
  streamVertexRagGroundedChat,
} from "@/lib/rag/vertex-rag-grounded-chat";
import {
  chatWithSalesAgent,
  resolveSearchPlanWithProfile,
  streamSalesAgentChat,
} from "@/lib/gemini/sales-agent-orchestrator";
import { chatWithRawRagRetrieval } from "@/lib/rag/rag-raw-chat";

export type { ScriptCitation };
export type { SalesChatResult, SalesChatStreamEvent } from "@/lib/gemini/sales-chat-types";
import type { SalesChatResult, SalesChatStreamEvent } from "@/lib/gemini/sales-chat-types";

function isMockChatEnabled() {
  const flag = (process.env.USE_MOCK_CHAT ?? "false").toLowerCase();
  return flag === "true" || flag === "1";
}

function noMatchResult(message: string, reply?: string): SalesChatResult {
  return {
    reply: reply ?? notInQuestionBankMessage(),
    bullets: [],
    citations: [],
    inQuestionBank: false,
    allowAddRequest: true,
    question: message,
  };
}

function outOfScopeResult(message: string, reply: string): SalesChatResult {
  return {
    reply,
    bullets: [],
    citations: [],
    inQuestionBank: false,
    allowAddRequest: true,
    question: message,
  };
}

function successResult(
  intro: string,
  bullets: string[],
  rawCitations: ScriptCitation[],
): SalesChatResult {
  const prep = prepareCitationCards(rawCitations);
  return {
    reply: intro,
    bullets,
    citations: prep.cards,
    citationsOverflow: prep.overflowCount > 0 ? prep.overflowCount : undefined,
    inQuestionBank: true,
  };
}

function localReply(message: string, citations: ScriptCitation[]) {
  const { intro, bullets } = buildKnowledgeReply(message, citations);
  return { intro, bullets };
}

async function tryDataAgentReply(
  message: string,
  citations: ScriptCitation[] = [],
  profile: SalesQuestionProfile,
): Promise<{ intro: string; bullets: string[] } | null> {
  const raw = await dataAgentChat(buildDataAgentRawPrompt(message, profile));
  if (!raw || !isUsableReply(raw) || looksLikeTableDump(raw)) return null;

  const text = raw.trim();
  if (!text) return null;

  if (isDataAgentRawMode()) {
    return { intro: text, bullets: [] };
  }

  if (isDataAgentFormatMode()) {
    const formatted = await formatDataAgentOutputForSales(text, message, citations, profile);
    if (formatted && (formatted.intro || formatted.bullets.length > 0)) {
      return formatted;
    }
  }

  const fallback = formatMarkdownReplyToDisplay(text);
  return sanitizeDataAgentDisplay(fallback.intro, fallback.bullets);
}

function groundedFallbackEnabled(): boolean {
  const raw = (process.env.SALES_RAG_GROUNDED_FALLBACK ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0";
}

async function tryGroundedRagChat(
  message: string,
  scope: KnowledgeSearchScope,
): Promise<SalesChatResult | "fallback"> {
  const inactiveReply = resolveInactiveProductBlock(message, scope);
  if (inactiveReply) {
    return noMatchResult(message, inactiveReply);
  }

  const { plan, profile } = await resolveSearchPlanWithProfile(message, scope);
  if (plan.intent === "off_topic") {
    return {
      reply: "此問題與汽車銷售知識庫無關，目前無法回答。若有 X-TRAIL、競品對戰、話術或配備相關問題，歡迎再問。",
      bullets: [],
      citations: [],
      inQuestionBank: false,
      allowAddRequest: false,
      question: message,
    };
  }

  const preCheck = assessSalesQueryAnswerability(message, [], {
    questionCategory: profile.category,
    scope,
  });
  if (!preCheck.ok && preCheck.userReply) {
    return outOfScopeResult(message, preCheck.userReply);
  }

  try {
    const grounded = await chatWithVertexRagGrounding(message, profile);
    if (!grounded.rawText.trim() && grounded.citations.length === 0) {
      if (isSpecQuestion(message, profile)) {
        console.warn("[sales] spec grounded empty → fallback retrieve pipeline");
        return "fallback";
      }
      return noMatchResult(message);
    }

    const answerability = assessSalesQueryAnswerability(message, grounded.citations, {
      questionCategory: profile.category,
      scope,
    });
    if (!answerability.ok && !isSpecQuestion(message, profile) && !isCostDetailQuery(message)) {
      return outOfScopeResult(
        message,
        answerability.userReply ?? outOfScopeKnowledgeMessage(),
      );
    }

    const hasAnswer =
      grounded.intro.trim().length > 0 ||
      grounded.bullets.length > 0 ||
      grounded.rawText.trim().length > 0;
    if (!hasAnswer && grounded.citations.length === 0) {
      return noMatchResult(message);
    }
    if (!hasAnswer) {
      console.warn("[sales] grounded empty gemini text, fallback retrieve pipeline");
      return "fallback";
    }

    return successResult(
      grounded.intro,
      grounded.bullets,
      grounded.citations,
    );
  } catch (e) {
    console.error("RAG Grounding failed", e);
    if (e instanceof RagSearchError && e.needsReauth) {
      return {
        reply:
          "知識庫連線失敗（Google 憑證已過期）。請在本機執行：gcloud auth application-default login",
        bullets: [],
        citations: [],
        inQuestionBank: false,
        allowAddRequest: false,
        question: message,
      };
    }
    if (!groundedFallbackEnabled()) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        reply: `RAG Grounding 失敗：${msg.slice(0, 240)}`,
        bullets: [],
        citations: [],
        inQuestionBank: false,
        allowAddRequest: false,
        question: message,
      };
    }
    console.warn("[sales] grounding fallback → retrieve-then-summarize");
    return "fallback";
  }
}

async function chatWithRetrievePipeline(
  message: string,
  scope: KnowledgeSearchScope,
  mode: ReturnType<typeof resolveSalesChatMode>,
): Promise<SalesChatResult> {
  const inactiveReply = resolveInactiveProductBlock(message, scope);
  if (inactiveReply) {
    return noMatchResult(message, inactiveReply);
  }

  const { plan, profile } = await resolveSearchPlanWithProfile(message, scope);

  const preCheck = assessSalesQueryAnswerability(message, [], { scope });
  if (!preCheck.ok && preCheck.userReply) {
    return outOfScopeResult(message, preCheck.userReply);
  }

  if (plan.intent === "off_topic") {
    return {
      reply: "此問題與汽車銷售知識庫無關，目前無法回答。若有 X-TRAIL、競品對戰、話術或配備相關問題，歡迎再問。",
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
    console.error("Knowledge search failed", e);
    const msg = e instanceof Error ? e.message : String(e);
    const isRag = (process.env.SALES_KNOWLEDGE_BACKEND ?? "rag").trim().toLowerCase() !== "bq";
    if (e instanceof RagSearchError) {
      if (e.needsReauth) {
        return {
          reply:
            "知識庫連線失敗（Google 憑證已過期）。請在本機執行：gcloud auth application-default login",
          bullets: [],
          citations: [],
          inQuestionBank: false,
          allowAddRequest: false,
          question: message,
        };
      }
      if (e.misconfigured || /RAG 未設定|Agent Search|語料庫|CONTENT_REQUIRED/i.test(msg)) {
        return {
          reply: `檢索服務：${msg}`,
          bullets: [],
          citations: [],
          inQuestionBank: false,
          allowAddRequest: false,
          question: message,
        };
      }
    }
    const needsReauth = /invalid_grant|invalid_rapt|reauth|無法取得 Google 憑證/i.test(msg);
    if (needsReauth) {
      return {
        reply: isRag
          ? "知識庫連線失敗（Google 憑證已過期）。請在本機執行：gcloud auth application-default login"
          : "知識庫連線失敗（Google 憑證已過期）。請執行 gcloud auth application-default login 後重試",
        bullets: [],
        citations: [],
        inQuestionBank: false,
        allowAddRequest: false,
        question: message,
      };
    }
    if (isRag && /RAG 未設定|Agent Search/i.test(msg)) {
      return {
        reply: `檢索服務設定不完整：${msg}`,
        bullets: [],
        citations: [],
        inQuestionBank: false,
        allowAddRequest: false,
        question: message,
      };
    }
    return noMatchResult(message);
  }

  if (citations.length === 0) {
    return noMatchResult(message);
  }

  const answerability = assessSalesQueryAnswerability(message, citations, {
    questionCategory: profile.category,
    scope,
  });
  if (!answerability.ok && !isSpecQuestion(message, profile)) {
    return outOfScopeResult(
      message,
      answerability.userReply ?? outOfScopeKnowledgeMessage(answerability.unknownTerms),
    );
  }

  const specDirect = tryBuildSpecNumericReply(message, citations);
  if (specDirect && specDirect.bullets.length > 0) {
    return successResult(specDirect.intro, specDirect.bullets, citations);
  }

  // 快路徑：已有 citations 時直接用 Gemini 整理，略過 Data Agent（省 5–15 秒）
  const summarizeFirst =
    skipDataAgentWhenCitationsFound() &&
    citations.length > 0 &&
    mode !== "bq-fast" &&
    canUseGeminiSummarize();

  if (summarizeFirst) {
    try {
      const gemini = await summarizeCitationsWithGemini(message, citations, profile);
      if (gemini && gemini.bullets.length > 0) {
        const intro = gemini.intro || localReply(message, citations).intro;
        return successResult(intro, gemini.bullets, citations);
      }
    } catch (e) {
      console.error("Gemini summarize (fast path) failed", e);
    }
    if (neverCallDataAgent()) {
      const local = localReply(message, citations);
      if (local.bullets.length > 0) {
        return successResult(local.intro, local.bullets, citations);
      }
      return noMatchResult(message);
    }
  }

  if (mode === "data-agent" && canUseDataAgent() && !neverCallDataAgent() && !isRagKnowledgeBackend()) {
    try {
      const agent = await tryDataAgentReply(message, citations, profile);
      if (agent && (agent.intro || agent.bullets.length > 0)) {
        return successResult(agent.intro, agent.bullets, citations);
      }
    } catch (e) {
      console.error("Data Agent failed, fallback to hybrid", e);
    }
  }

  if (mode !== "bq-fast" && canUseGeminiSummarize()) {
    try {
      const gemini = await summarizeCitationsWithGemini(message, citations, profile);
      if (gemini && gemini.bullets.length > 0) {
        const intro = gemini.intro || localReply(message, citations).intro;
        return successResult(intro, gemini.bullets, citations);
      }
    } catch (e) {
      console.error("Gemini summarize failed, fallback to local", e);
    }
  }

  if (mode === "hybrid" && canUseDataAgent() && !neverCallDataAgent() && !isRagKnowledgeBackend()) {
    try {
      const agent = await tryDataAgentReply(message, citations, profile);
      if (agent && (agent.intro || agent.bullets.length > 0)) {
        return successResult(agent.intro, agent.bullets, citations);
      }
    } catch (e) {
      console.error("Data Agent hybrid fallback failed", e);
    }
  }

  const local = localReply(message, citations);
  if (local.bullets.length === 0) {
    return noMatchResult(message);
  }

  return successResult(local.intro, local.bullets, citations);
}

/** @deprecated 相容舊名稱 */
export async function searchScriptRows(
  message: string,
  limit = 6,
  scope: KnowledgeSearchScope = {},
): Promise<ScriptCitation[]> {
  return searchKnowledgeCitations(message, scope, limit);
}

/**
 * 銷售助手問答
 * - grounded：Vertex Gemini RAG Grounding（對齊 Console）
 * - agent：Function Calling 分流 → 固定 BQ SQL → Gemini 摘要
 * - hybrid：檢索 → Gemini 摘要
 * - bq-fast：僅 BQ + 本地摘要
 */
export async function chatWithDataAgent(
  message: string,
  scope: KnowledgeSearchScope = {},
): Promise<SalesChatResult> {
  if (isMockChatEnabled()) {
    return noMatchResult(message);
  }

  const mode = resolveSalesChatMode();

  if (mode === "rag-raw" && isRagKnowledgeBackend()) {
    return chatWithRawRagRetrieval(message);
  }

  if (mode === "agent") {
    return chatWithSalesAgent(message, scope);
  }

  if (mode === "grounded" && isRagKnowledgeBackend()) {
    const grounded = await tryGroundedRagChat(message, scope);
    if (grounded !== "fallback") return grounded;
  }

  return chatWithRetrievePipeline(message, scope, mode);
}

/**
 * 串流問答：grounded / hybrid 先推 citations，再打字輸出；agent 走原串流管線。
 */
export async function* streamSalesChat(
  message: string,
  scope: KnowledgeSearchScope = {},
): AsyncGenerator<SalesChatStreamEvent> {
  if (isMockChatEnabled()) {
    yield { type: "done", result: noMatchResult(message) };
    return;
  }

  const mode = resolveSalesChatMode();

  if (mode === "rag-raw" && isRagKnowledgeBackend()) {
    const result = await chatWithRawRagRetrieval(message);
    yield { type: "done", result };
    return;
  }

  if (mode === "agent") {
    yield* streamSalesAgentChat(message, scope);
    return;
  }

  if (mode === "grounded" && isRagKnowledgeBackend()) {
    const inactiveReply = resolveInactiveProductBlock(message, scope);
    if (inactiveReply) {
      yield {
        type: "done",
        result: noMatchResult(message, inactiveReply),
      };
      return;
    }

    const { plan, profile } = await resolveSearchPlanWithProfile(message, scope);
    if (plan.intent === "off_topic") {
      yield {
        type: "done",
        result: {
          reply: "此問題與汽車銷售知識庫無關，目前無法回答。若有 X-TRAIL、競品對戰、話術或配備相關問題，歡迎再問。",
          bullets: [],
          citations: [],
          inQuestionBank: false,
          allowAddRequest: false,
          question: message,
        },
      };
      return;
    }

    const preCheck = assessSalesQueryAnswerability(message, [], {
      questionCategory: profile.category,
      scope,
    });
    if (!preCheck.ok && preCheck.userReply) {
      yield { type: "done", result: outOfScopeResult(message, preCheck.userReply) };
      return;
    }

    yield* streamVertexRagGroundedChat(message, profile);
    return;
  }

  yield { type: "status", text: "正在查詢知識庫…" };

  const inactiveReply = resolveInactiveProductBlock(message, scope);
  if (inactiveReply) {
    yield {
      type: "done",
      result: noMatchResult(message, inactiveReply),
    };
    return;
  }

  const { plan, profile } = await resolveSearchPlanWithProfile(message, scope);

  const preCheck = assessSalesQueryAnswerability(message, [], {
    questionCategory: profile.category,
    scope,
  });
  if (!preCheck.ok && preCheck.userReply && !isSpecQuestion(message, profile)) {
    yield { type: "done", result: outOfScopeResult(message, preCheck.userReply) };
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

  let citations: ScriptCitation[] = [];
  try {
    citations = await searchKnowledgeByPlan(message, plan, profile);
  } catch (e) {
    console.error("stream pipeline search failed", e);
    yield { type: "error", message: "知識庫查詢失敗" };
    yield { type: "done", result: noMatchResult(message) };
    return;
  }

  if (citations.length === 0) {
    yield { type: "done", result: noMatchResult(message) };
    return;
  }

  const answerability = assessSalesQueryAnswerability(message, citations, {
    questionCategory: profile.category,
    scope,
  });
  if (!answerability.ok && !isSpecQuestion(message, profile)) {
    yield {
      type: "done",
      result: outOfScopeResult(
        message,
        answerability.userReply ?? outOfScopeKnowledgeMessage(answerability.unknownTerms),
      ),
    };
    return;
  }

  const prep = prepareCitationCards(citations);
  yield {
    type: "citations_ready",
    citations: prep.cards,
    citationsOverflow: prep.overflowCount > 0 ? prep.overflowCount : undefined,
  };

  yield { type: "status", text: "正在整理回覆…" };

  if (canUseGeminiSummarize()) {
    try {
      for await (const delta of streamIntroFromCitations(message, citations, profile)) {
        yield { type: "intro_delta", text: delta };
      }
      const gemini = await summarizeCitationsWithGemini(message, citations, profile);
      if (gemini && gemini.bullets.length > 0) {
        yield {
          type: "done",
          result: successResult(
            gemini.intro || localReply(message, citations).intro,
            gemini.bullets,
            citations,
          ),
        };
        return;
      }
    } catch (e) {
      console.error("stream summarize failed", e);
    }
  }

  const local = localReply(message, citations);
  yield {
    type: "done",
    result: successResult(local.intro, local.bullets, citations),
  };
}
