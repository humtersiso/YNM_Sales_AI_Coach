import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { notInQuestionBankMessage } from "@/lib/gemini/reply-format";
import type { SalesChatResult } from "@/lib/gemini/sales-chat-types";
import { prepareCitationCards } from "@/lib/gemini/citation-utils";
import { listConfiguredRagCorpora } from "@/lib/rag/rag-engine-config";
import { searchVertexRagCorpus } from "@/lib/rag/vertex-rag-search";
import { isSpecRetrievalRoute } from "@/lib/gemini/retrieval-query-builder";

function rawTopK(): number {
  const n = Number(process.env.RAG_RAW_TOP_K ?? "1");
  return Number.isNaN(n) || n <= 0 ? 1 : Math.min(n, 10);
}

/** 純 RAG：retrieveContexts 三庫並查，取 relevance 最高 1 chunk 原文回覆。 */
export async function chatWithRawRagRetrieval(message: string): Promise<SalesChatResult> {
  const q = message.trim();
  if (!q) {
    return { reply: "", bullets: [], citations: [], inQuestionBank: false, question: message };
  }

  const topK = rawTopK();
  const specRoute = isSpecRetrievalRoute(q);
  const corpora = listConfiguredRagCorpora().filter((c) => {
    if (!c.ragCorpusResource.includes("/ragCorpora/")) return false;
    if (specRoute) {
      return c.materialCategory === "product_info" || c.materialCategory === "competitor_compare";
    }
    return true;
  });

  const lists = await Promise.all(
    corpora.map((c) =>
      searchVertexRagCorpus(c.ragCorpusResource, q, c.materialCategory, topK, { specQuery: specRoute }),
    ),
  );

  const merged = lists.flat().sort((a, b) => b.relevance - a.relevance);
  const top = merged[0];

  if (!top) {
    return {
      reply: notInQuestionBankMessage(),
      bullets: [],
      citations: [],
      inQuestionBank: false,
      allowAddRequest: true,
      question: message,
    };
  }

  const internal: ScriptCitation[] = [
    {
      index: 1,
      question: top.title,
      script: top.snippet,
      page: top.pageLabel,
      sourceLabel: "RAG 原文",
      sourceKind: "rag-raw",
    },
  ];

  const prep = prepareCitationCards(internal);
  return {
    reply: top.snippet,
    bullets: [],
    citations: prep.cards,
    citationsOverflow: prep.overflowCount > 0 ? prep.overflowCount : undefined,
    inQuestionBank: true,
    question: message,
  };
}
