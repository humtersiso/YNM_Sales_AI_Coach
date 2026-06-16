import type { ApiUser, SalesChatRequestBody } from "@ynm/contracts";
import type { SalesChatResult } from "../../../src/lib/gemini/sales-chat-types";
import type { MaterialCategory } from "../../../src/lib/ingest/contracts/material-category-contract";

async function loadKnowledgeScope() {
  return import("../../../src/lib/knowledge/search-scope");
}

async function loadMaterialCategory() {
  return import("../../../src/lib/ingest/contracts/material-category-contract");
}

async function loadSalesChat() {
  return import("../../../src/lib/gemini/conversational-analytics");
}

async function loadUsage() {
  return import("../../../src/lib/bq/usage-events");
}

async function loadReplyFormat() {
  return import("../../../src/lib/analytics/reply-log-format");
}

async function parseScope(body: SalesChatRequestBody) {
  const { getDefaultSalesProductLine } = await loadKnowledgeScope();
  const { normalizeMaterialCategory } = await loadMaterialCategory();
  const productLine = (body.productLine ?? "").trim() || getDefaultSalesProductLine();
  const rawCategory = (body.materialCategory ?? "").trim();
  const materialCategory = rawCategory
    ? normalizeMaterialCategory(rawCategory)
    : null;
  return {
    productLine,
    materialCategory: materialCategory as MaterialCategory | null,
  };
}

async function logUsage(user: ApiUser, message: string, result: SalesChatResult | null) {
  const { insertUsageEvent } = await loadUsage();
  const { formatSalesReplyForUsageLog } = await loadReplyFormat();
  await insertUsageEvent({
    userId: user.userId,
    username: user.displayName || user.username,
    branch: user.branch ?? "",
    assistantType: "sales",
    questionKind: "bank",
    question: message,
    replySummary: result ? formatSalesReplyForUsageLog(result) : "",
    inQuestionBank: result?.inQuestionBank ?? true,
  }).catch(() => null);
}

export async function salesChat(user: ApiUser, body: SalesChatRequestBody) {
  const message = (body.message ?? "").trim();
  if (!message) {
    return { error: "請輸入問題", status: 400 as const };
  }
  const scope = await parseScope(body);
  const { chatWithDataAgent } = await loadSalesChat();
  const result = await chatWithDataAgent(message, scope);
  await logUsage(user, message, result);
  return {
    status: 200 as const,
    body: {
      reply: result.reply,
      bullets: result.bullets,
      citations: result.citations,
      inQuestionBank: result.inQuestionBank,
      allowAddRequest: result.allowAddRequest ?? false,
      question: result.question,
    },
  };
}

export async function* salesChatStreamEvents(user: ApiUser, body: SalesChatRequestBody) {
  const message = (body.message ?? "").trim();
  if (!message) {
    yield { type: "error" as const, message: "請輸入問題" };
    return;
  }
  const scope = await parseScope(body);
  const { streamSalesChat } = await loadSalesChat();
  let finalResult: SalesChatResult | null = null;
  try {
    for await (const event of streamSalesChat(message, scope)) {
      yield event;
      if (event.type === "done") finalResult = event.result;
    }
    await logUsage(user, message, finalResult);
  } catch (e) {
    console.error("sales chat stream failed", e);
    yield { type: "error" as const, message: "查詢失敗，請稍後再試" };
  }
}

export async function salesKnowledgeMeta() {
  const { getKnowledgeMetaForClient } = await loadKnowledgeScope();
  return getKnowledgeMetaForClient();
}
