import { buildKnowledgeReply } from "@/lib/gemini/knowledge-reply";
import { geminiGenerateText, getGcpAccessToken } from "@/lib/gemini/gemini-client";
import {
  prepareCitationCards,
  visibleCitationDocCount,
} from "@/lib/gemini/citation-utils";
import type { SalesChatStreamEvent } from "@/lib/gemini/sales-chat-types";
import { groundingMaxOutputTokens } from "@/lib/gemini/sales-chat-speed";
import {
  SALES_GROUNDED_REPLY_LENGTH_HINT,
  SALES_REPLY_LENGTH_HINT,
} from "@/lib/gemini/sales-reply-config";
import {
  normalizeReplyLine,
  finalizeGroundedClientReply,
  sanitizeReplyCitationMarkers,
  outOfScopeKnowledgeMessage,
  type ScriptCitation,
} from "@/lib/gemini/reply-format";
import {
  buildCompetitorDefenseRules,
  buildGroundedSynthesisRules,
  SALES_DIRECT_REPLY_RULES,
} from "@/lib/gemini/sales-reply-directives";
import { isCostDetailQuery } from "@/lib/gemini/cost-query-expand";
import {
  buildCitationMarkerHardLimit,
  buildCitationMarkerRules,
  buildKnowledgeXmlContext,
  parseCitationSourceParts,
  type CitationCard,
} from "@/lib/gemini/citation-card";
import {
  buildPrimarySearchQuery,
  buildRetrievalChannels,
  isDualChannelComparison,
  isSpecRetrievalRoute,
} from "@/lib/gemini/retrieval-query-builder";
import { isSpecNumericQuery } from "@/lib/gemini/spec-query-expand";
import type { SalesQuestionProfile } from "@/lib/gemini/sales-question-profile";
import {
  classifySalesQuestion,
  extractMentionedCompetitor,
  isSpecQuestion,
} from "@/lib/gemini/sales-question-profile";
import { RagSearchError } from "@/lib/rag/discovery-engine-search";
import {
  buildRagRetrievalConfig,
  getRagCorpusForCategory,
  getRagEngineLocation,
  getRagProjectId,
  listConfiguredRagCorpora,
  normalizeRagCorpusResource,
} from "@/lib/rag/rag-engine-config";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";
import { stripRagBoilerplate } from "@/lib/rag/rag-citation-format";
import { searchVertexRagCorpus } from "@/lib/rag/vertex-rag-search";
import { mergeRagHitsByRrf } from "@/lib/rag/rag-hit-merge";
import {
  extractRagChunkSourceMeta,
  parseAugmentFactsFromResponse,
} from "@/lib/rag/vertex-rag-chunk-parse";
import { resolveInactiveProductBlock } from "@/lib/gemini/inactive-product-guard";
import { assessSalesQueryAnswerability } from "@/lib/gemini/query-relevance-guard";

export type GroundedChatResult = {
  intro: string;
  bullets: string[];
  citations: ScriptCitation[];
  model: string;
  chunkCount: number;
  rawText: string;
  corpus?: string;
  impl?: "generate" | "augment";
};

function groundingImplMode(): "generate" | "augment" | "auto" {
  const raw = (process.env.SALES_RAG_GROUNDING_IMPL ?? "auto").trim().toLowerCase();
  if (raw === "generate" || raw === "native") return "generate";
  if (raw === "augment" || raw === "augment-prompt") return "augment";
  return "auto";
}

/** 與 2026-06-03 grounded-full log 對齊：augment 預設不先走 retrieve-first */
function useGroundedRetrieveFirst(): boolean {
  const raw = (process.env.SALES_GROUNDED_RETRIEVE_FIRST ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return groundingImplMode() !== "augment";
}

type JsonRecord = Record<string, unknown>;

function groundingTopK(): number {
  const n = Number(process.env.RAG_GROUNDING_TOP_K ?? process.env.RAG_CITATION_DISPLAY_MAX ?? "12");
  return Number.isNaN(n) || n <= 0 ? 12 : Math.min(n, 20);
}

function groundingModelCandidates(): string[] {
  const preferred = (process.env.GEMINI_GROUNDING_MODEL ?? "").trim();
  const defaults = [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash",
  ];
  /** 勿沿用 GEMINI_MODEL：API 專用型號在 Vertex RAG Grounding 可能不可用 */
  return [...new Set([preferred, ...defaults].filter(Boolean))];
}

function buildSystemInstruction(
  profile?: SalesQuestionProfile,
  userQuestion = "",
): string {
  const hero = profile?.heroProduct.displayName ?? "X-TRAIL ICE";
  const defense = buildCompetitorDefenseRules(profile, userQuestion);
  return `你是裕隆日產 ${hero} 銷售話術助手。請依「檢索到的知識庫片段」回答，勿捏造。
${SALES_DIRECT_REPLY_RULES}
${defense ? `\n${defense}` : ""}
- 規格數字（馬力 ps、扭力 kgm、油耗 km/l）若片段有，必須寫出
- 可分段小標，但勿用 markdown 列點符號（- *）`;
}

function selectGroundingCorpus(message: string, profile?: SalesQuestionProfile): string {
  const override = (process.env.RAG_GROUNDING_CORPUS ?? "").trim();
  if (override) return normalizeRagCorpusResource(override);

  let category: MaterialCategory = "product_info";
  if (profile?.category === "competitor") category = "competitor_compare";
  else if (profile?.category === "sales_qa") category = "sales_script";
  else if (profile?.category === "spec") category = "product_info";
  else if (isSpecNumericQuery(message) && !extractMentionedCompetitor(message)) {
    category = "product_info";
  } else if (
    isSpecNumericQuery(message) ||
    /馬力|扭力|功率|\bps\b|kgm|km\/l/i.test(message)
  ) {
    category = "competitor_compare";
  }

  const corpus = getRagCorpusForCategory(category);
  if (corpus?.ragCorpusResource.includes("/ragCorpora/")) {
    return corpus.ragCorpusResource;
  }

  const fallback = listConfiguredRagCorpora().find((c) => c.ragCorpusResource.includes("/ragCorpora/"));
  return fallback?.ragCorpusResource ?? "";
}

function pick(obj: JsonRecord | undefined, ...keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    if (k in obj) return obj[k];
  }
  return undefined;
}

function asRecord(v: unknown): JsonRecord | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v != null ? [v] : [];
}

function parseGroundingChunks(json: JsonRecord): Array<{ title: string; text: string; uri?: string }> {
  const candidate = asRecord(asArray(json.candidates)[0]);
  const meta = asRecord(pick(candidate, "groundingMetadata", "grounding_metadata"));
  const chunksRaw = asArray(pick(meta, "groundingChunks", "grounding_chunks"));
  const out: Array<{ title: string; text: string; uri?: string }> = [];

  for (const item of chunksRaw) {
    const chunk = asRecord(item);
    const ctx = asRecord(pick(chunk, "retrievedContext", "retrieved_context"));
    const text = String(pick(ctx, "text") ?? pick(chunk, "text") ?? "").trim();
    if (!text || text.length < 4) continue;
    const title = String(
      pick(ctx, "title") ?? pick(ctx, "sourceDisplayName", "source_display_name") ?? "RAG 片段",
    ).trim();
    const uri = String(pick(ctx, "uri", "sourceUri", "source_uri") ?? "").trim() || undefined;
    out.push({ title, text, uri });
  }
  return out;
}

function parseResponseText(json: JsonRecord): string {
  const candidate = asRecord(asArray(json.candidates)[0]);
  const content = asRecord(pick(candidate, "content"));
  const parts = asArray(pick(content, "parts"));
  const texts: string[] = [];
  for (const p of parts) {
    const part = asRecord(p);
    const t = String(pick(part, "text") ?? "").trim();
    if (t) texts.push(t);
  }
  return texts.join("\n").trim();
}

function chunksToCitations(message: string, chunks: Array<{ title: string; text: string; uri?: string }>): ScriptCitation[] {
  const citations: ScriptCitation[] = [];
  for (const chunk of chunks) {
    const body = String(chunk.text ?? "").trim();
    if (body.length < 4) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[rag] 略過無正文 chunk", { title: chunk.title });
      }
      continue;
    }
    const hit: RagChunkHit = {
      title: chunk.title,
      snippet: body,
      uri: chunk.uri,
      materialCategory: "general",
      relevance: 100 - citations.length,
    };
    const meta = extractRagChunkSourceMeta({ text: body, sourceUri: chunk.uri, title: chunk.title });
    const fileTitle =
      meta.fileName.replace(/^gs:\/\/.*?\//, "").replace(/\.pdf$/i, "") ||
      parseCitationSourceParts(chunk.title).title;
    const page =
      meta.page?.first != null
        ? meta.page.last != null && meta.page.last !== meta.page.first
          ? `第 ${meta.page.first}–${meta.page.last} 頁`
          : `第 ${meta.page.first} 頁`
        : parseCitationSourceParts(chunk.title).page;
    const excerpt = stripRagBoilerplate(body);
    citations.push({
      index: citations.length + 1,
      question: fileTitle,
      script: excerpt,
      page,
      sourceLabel: fileTitle,
      scriptLabel: chunk.uri ? "向量檢索摘錄" : "摘錄",
      sourceKind: "rag-grounding",
    });
  }
  return citations;
}

function buildGroundedGenPrompt(
  profile: SalesQuestionProfile | undefined,
  cards: CitationCard[],
  userQuestion: string,
  extraInstruction = "",
): string {
  const xml = buildKnowledgeXmlContext(cards);
  const docCount = cards.length;
  const markerRules = buildCitationMarkerRules(docCount);
  const markerHardLimit = buildCitationMarkerHardLimit(docCount);
  const synthesis = buildGroundedSynthesisRules(userQuestion, profile);
  const extra = [extraInstruction, synthesis].filter(Boolean).join("\n");
  return [
    buildSystemInstruction(profile, userQuestion),
    "",
    markerHardLimit,
    "",
    markerRules,
    "",
    "以下為知識庫檢索注入內容（請僅依此回答）：",
    `<Knowledge_Base>\n${xml}\n</Knowledge_Base>`,
    "",
    `使用者問題：${userQuestion}`,
    "請直接回答，規格數字若片段有必須寫出。",
    SALES_REPLY_LENGTH_HINT,
    SALES_GROUNDED_REPLY_LENGTH_HINT,
    "手機現場查閱：先一句結論，列點最多 3 條、每條精簡可複誦，勿長篇展開。",
    "輸出結構（必守）：第一行一句結論（可含 [n]）；空一行；最多 3 行，每行以「建議可強調／重點在於／可回覆客戶」等開頭，勿用 - 或 * 列點符號，勿寫長段落。",
    extra,
    "",
    markerHardLimit,
  ]
    .filter(Boolean)
    .join("\n");
}

function groundingMaterialCategory(profile?: SalesQuestionProfile): MaterialCategory {
  if (profile?.category === "competitor") return "competitor_compare";
  if (profile?.category === "sales_qa") return "sales_script";
  return "product_info";
}

/** 單庫 retrieveContexts（比 augmentPrompt 少一輪 API，利於串流與降延遲） */
async function retrieveSingleCorpusFacts(
  message: string,
  profile: SalesQuestionProfile | undefined,
  ragCorpus: string,
  topK: number,
): Promise<Array<{ title: string; text: string; uri?: string }>> {
  const q = buildPrimarySearchQuery(message, profile).trim();
  const category = groundingMaterialCategory(profile);
  const hits = await searchVertexRagCorpus(ragCorpus, q, category, topK, {
    specQuery: isSpecRetrievalRoute(message, profile),
  });
  return hits.map((h) => ({ title: h.title, text: h.snippet, uri: h.uri }));
}

/** 多通道或單庫檢索（不呼叫 Gemini） */
export async function retrieveGroundedFacts(
  message: string,
  profile?: SalesQuestionProfile,
): Promise<Array<{ title: string; text: string; uri?: string }>> {
  const topK = groundingTopK();

  if (
    profile &&
    (isDualChannelComparison(message, profile) ||
      isSpecRetrievalRoute(message, profile) ||
      (isCostDetailQuery(message) && extractMentionedCompetitor(message)))
  ) {
    const perChannel = isSpecRetrievalRoute(message, profile)
      ? Number(process.env.RAG_SPEC_RETRIEVAL_TOP_K ?? "6") || 6
      : Math.max(4, Math.ceil(topK / 2));
    const facts = await retrieveMultiChannelFacts(message, profile, perChannel);
    if (facts.length > 0) return facts;
  }

  const q = buildPrimarySearchQuery(message, profile).trim();
  const ragCorpus = selectGroundingCorpus(q, profile);
  if (!ragCorpus.includes("/ragCorpora/")) return [];
  return retrieveSingleCorpusFacts(message, profile, ragCorpus, topK);
}

function parseAndSanitizeGroundedReply(
  rawText: string,
  maxDocId: number,
): { intro: string; bullets: string[] } {
  return finalizeGroundedClientReply(rawText, maxDocId);
}

function groundedGuardRejectReply(
  message: string,
  citations: ScriptCitation[],
  profile: SalesQuestionProfile,
  scope?: { productLine?: string },
): string | null {
  const inactiveReply = resolveInactiveProductBlock(message, scope ?? {});
  if (inactiveReply) return inactiveReply;

  const answerability = assessSalesQueryAnswerability(message, citations, {
    questionCategory: profile.category,
    scope,
  });
  if (!answerability.ok && !isSpecQuestion(message, profile) && !isCostDetailQuery(message)) {
    return answerability.userReply ?? outOfScopeKnowledgeMessage();
  }
  return null;
}

function groundedGuardRejectStreamDone(
  message: string,
  reply: string,
): SalesChatStreamEvent {
  return {
    type: "done",
    result: {
      reply,
      bullets: [],
      citations: [],
      inQuestionBank: false,
      allowAddRequest: true,
      question: message,
    },
  };
}

function vertexRagStorePayload(ragCorpus: string, retrievalConfig: Record<string, unknown>) {
  return {
    rag_resources: [{ rag_corpus: ragCorpus }],
    rag_retrieval_config: retrievalConfig,
  };
}

function parseContentText(content: unknown): string {
  const c = asRecord(content);
  const parts = asArray(pick(c, "parts"));
  return parts
    .map((p) => String(pick(asRecord(p), "text") ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** augmentPrompt：RAG 注入 + 任意 Gemini 生成（asia-east1 無 native grounding 模型時的 Console 等價路徑） */
async function retrieveMultiChannelFacts(
  message: string,
  profile: SalesQuestionProfile,
  perChannelTopK: number,
): Promise<Array<{ title: string; text: string; uri?: string }>> {
  const channels = buildRetrievalChannels(message, profile);
  const lists = await Promise.all(
    channels.map(async (ch) => {
      const corpus = getRagCorpusForCategory(ch.materialCategory);
      if (!corpus?.ragCorpusResource.includes("/ragCorpora/")) return [] as RagChunkHit[];
      return searchVertexRagCorpus(
        corpus.ragCorpusResource,
        ch.query,
        ch.materialCategory,
        perChannelTopK,
        { specQuery: isSpecRetrievalRoute(message, profile) },
      );
    }),
  );
  const merged = mergeRagHitsByRrf(lists.filter((l) => l.length > 0));
  return merged.slice(0, perChannelTopK * 2).map((h) => ({
    title: h.title,
    text: h.snippet,
    uri: h.uri,
  }));
}

async function chatWithMergedFactsGrounding(
  originalMessage: string,
  profile: SalesQuestionProfile,
  facts: Array<{ title: string; text: string; uri?: string }>,
): Promise<GroundedChatResult> {
  const citations = chunksToCitations(originalMessage, facts);
  const cards = prepareCitationCards(citations).cards;
  const synthesis = buildGroundedSynthesisRules(originalMessage, profile);
  const extra = [
    isDualChannelComparison(originalMessage, profile)
      ? "比較題需同時引用本品與競品片段，並統整成對照結論。"
      : "",
    synthesis,
  ]
    .filter(Boolean)
    .join("\n");
  const genPrompt = buildGroundedGenPrompt(profile, cards, originalMessage, extra);

  const rawText =
    (await geminiGenerateText(genPrompt, {
      temperature: 0.25,
      maxOutputTokens: groundingMaxOutputTokens(),
    })) ?? "";

  if (!rawText.trim() && facts.length === 0) {
    throw new RagSearchError("多通道 RAG 未回傳可用內容");
  }

  const maxDocId = cards.length;
  let { intro, bullets } = parseAndSanitizeGroundedReply(rawText, maxDocId);

  if (!intro.trim() && bullets.length === 0 && citations.length > 0) {
    const local = buildKnowledgeReply(originalMessage, citations);
    intro = local.intro;
    bullets = local.bullets;
  }

  if (bullets.length > 0 && intro.includes("\n")) {
    intro = intro.split("\n")[0]!.trim();
  }

  if (process.env.NODE_ENV === "development") {
    console.info("[rag] multi-channel grounding", {
      facts: facts.length,
      answerLen: rawText.length,
    });
  }

  return {
    intro:
      intro.trim() ||
      (bullets.length > 0 ? "" : rawText.trim().slice(0, 280)),
    bullets,
    citations,
    model: `multi-channel+${process.env.GEMINI_MODEL ?? "gemini"}`,
    chunkCount: facts.length,
    rawText,
    impl: "augment",
  };
}

async function chatWithAugmentPromptGrounding(
  q: string,
  profile: SalesQuestionProfile | undefined,
  ragCorpus: string,
  parent: string,
  location: string,
  token: string,
  topK: number,
  retrievalConfig: Record<string, unknown>,
): Promise<GroundedChatResult> {
  const url = `https://${location}-aiplatform.googleapis.com/v1/${parent}:augmentPrompt`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: q }] }],
      vertex_rag_store: vertexRagStorePayload(ragCorpus, retrievalConfig),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new RagSearchError(`augmentPrompt 失敗 (${res.status}): ${text.slice(0, 320)}`);
  }

  let json: JsonRecord;
  try {
    json = JSON.parse(text) as JsonRecord;
  } catch {
    throw new RagSearchError("augmentPrompt 回應無法解析");
  }

  const augmentedParts = asArray(json.augmentedPrompt);
  const augmentedText =
    augmentedParts.map((c) => parseContentText(c)).filter(Boolean).join("\n\n") ||
    parseContentText(json.augmentedPrompt);

  const facts = parseAugmentFactsFromResponse(json);

  const citeChunks =
    facts.length > 0
      ? facts
      : [{ title: "RAG 注入", text: augmentedText.slice(0, 2400) }];
  const citations = chunksToCitations(q, citeChunks);
  const cards = prepareCitationCards(citations).cards;
  const genPrompt = buildGroundedGenPrompt(profile, cards, q);

  const rawText = (await geminiGenerateText(genPrompt, {
    temperature: 0.25,
    maxOutputTokens: groundingMaxOutputTokens(),
  })) ?? "";

  if (!rawText.trim() && facts.length === 0) {
    throw new RagSearchError("augmentPrompt 未回傳可用內容");
  }

  const maxDocId = cards.length;
  const { intro, bullets } = parseAndSanitizeGroundedReply(rawText, maxDocId);

  if (process.env.NODE_ENV === "development") {
    console.info("[rag] augmentPrompt grounding", {
      corpus: ragCorpus.split("/ragCorpora/").pop(),
      top_k: topK,
      facts: facts.length,
      answerLen: rawText.length,
    });
  }

  return {
    intro:
      intro.trim() ||
      (bullets.length > 0 ? "" : rawText.trim().slice(0, 280)),
    bullets,
    citations,
    model: `augment+${process.env.GEMINI_MODEL ?? "gemini"}`,
    chunkCount: citeChunks.length,
    rawText,
    corpus: ragCorpus,
    impl: "augment",
  };
}

async function chatWithNativeGrounding(
  q: string,
  profile: SalesQuestionProfile | undefined,
  ragCorpus: string,
  parent: string,
  location: string,
  token: string,
  topK: number,
  retrievalConfig: Record<string, unknown>,
): Promise<GroundedChatResult> {
  const body = {
    systemInstruction: { parts: [{ text: buildSystemInstruction(profile, q) }] },
    contents: [{ role: "user", parts: [{ text: q }] }],
    tools: [
      {
        retrieval: {
          disable_attribution: false,
          vertex_rag_store: vertexRagStorePayload(ragCorpus, retrievalConfig),
        },
      },
    ],
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: groundingMaxOutputTokens(),
    },
  };

  let lastErr = "";
  for (const model of groundingModelCandidates()) {
    const url = `https://${location}-aiplatform.googleapis.com/v1/${parent}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      lastErr = `${model} (${res.status}): ${text.slice(0, 320)}`;
      if (res.status === 404 || /not found|does not have access/i.test(text)) continue;
      throw new RagSearchError(`RAG Grounding 失敗：${lastErr}`);
    }

    let json: JsonRecord;
    try {
      json = JSON.parse(text) as JsonRecord;
    } catch {
      throw new RagSearchError("RAG Grounding 回應無法解析");
    }

    const rawText = parseResponseText(json);
    const chunks = parseGroundingChunks(json);
    const citations = chunksToCitations(q, chunks);
    const maxDocId = visibleCitationDocCount(citations);
    const { intro, bullets } = parseAndSanitizeGroundedReply(rawText, maxDocId);

    if (process.env.NODE_ENV === "development") {
      console.info("[rag] native grounding", {
        model,
        corpus: ragCorpus.split("/ragCorpora/").pop(),
        top_k: topK,
        chunks: chunks.length,
        answerLen: rawText.length,
      });
    }

    return {
      intro:
        intro.trim() ||
        (bullets.length > 0 ? "" : rawText.trim().slice(0, 280)),
      bullets,
      citations,
      model,
      chunkCount: chunks.length,
      rawText,
      corpus: ragCorpus,
      impl: "generate",
    };
  }

  throw new RagSearchError(`RAG Grounding 無可用模型：${lastErr}`);
}

/**
 * Vertex RAG Grounding（Console 等價）
 * - native：generateContent + retrieval tool
 * - augment：augmentPrompt + Gemini（asia-east1 預設，模型不可用時自動 fallback）
 */
export async function chatWithVertexRagGrounding(
  message: string,
  profile?: SalesQuestionProfile,
): Promise<GroundedChatResult> {
  const q = buildPrimarySearchQuery(message, profile).trim();
  if (!q) {
    return { intro: "", bullets: [], citations: [], model: "", chunkCount: 0, rawText: "" };
  }

  const topK = groundingTopK();

  if (
    profile &&
    (isDualChannelComparison(message, profile) ||
      isSpecRetrievalRoute(message, profile) ||
      (isCostDetailQuery(message) && extractMentionedCompetitor(message)))
  ) {
    try {
      const perChannel = isSpecRetrievalRoute(message, profile)
        ? Number(process.env.RAG_SPEC_RETRIEVAL_TOP_K ?? "6") || 6
        : Math.max(4, Math.ceil(topK / 2));
      const facts = await retrieveMultiChannelFacts(message, profile, perChannel);
      if (facts.length > 0) {
        return chatWithMergedFactsGrounding(message, profile, facts);
      }
    } catch (e) {
      console.warn("[rag] multi-channel retrieval failed, fallback single corpus", e);
    }
  }

  const ragCorpus = selectGroundingCorpus(q, profile);
  if (!ragCorpus.includes("/ragCorpora/")) {
    throw new RagSearchError("RAG Grounding 未設定：請設定 RAG_CORPUS_* 或 RAG_GROUNDING_CORPUS");
  }

  const projectId = getRagProjectId();
  const location = getRagEngineLocation();
  const parent = `projects/${projectId}/locations/${location}`;
  const retrievalConfig = buildRagRetrievalConfig(topK, {
    specQuery: isSpecNumericQuery(message),
  });

  let token: string;
  try {
    token = await getGcpAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new RagSearchError(`無法取得 Google 憑證：${msg}`, /invalid_grant|reauth/i.test(msg));
  }

  if (useGroundedRetrieveFirst()) {
    try {
      const facts = await retrieveGroundedFacts(message, profile);
      if (facts.length > 0) {
        return chatWithMergedFactsGrounding(
          message,
          profile ?? classifySalesQuestion(message),
          facts,
        );
      }
    } catch (e) {
      console.warn("[rag] retrieve-first failed, fallback augment/native", e);
    }
  }

  const impl = groundingImplMode();
  if (impl === "augment") {
    return chatWithAugmentPromptGrounding(
      q,
      profile,
      ragCorpus,
      parent,
      location,
      token,
      topK,
      retrievalConfig,
    );
  }

  if (impl === "generate") {
    return chatWithNativeGrounding(
      q,
      profile,
      ragCorpus,
      parent,
      location,
      token,
      topK,
      retrievalConfig,
    );
  }

  try {
    return await chatWithNativeGrounding(
      q,
      profile,
      ragCorpus,
      parent,
      location,
      token,
      topK,
      retrievalConfig,
    );
  } catch (nativeErr) {
    console.warn("[rag] native grounding unavailable, fallback augmentPrompt", nativeErr);
    return chatWithAugmentPromptGrounding(
      q,
      profile,
      ragCorpus,
      parent,
      location,
      token,
      topK,
      retrievalConfig,
    );
  }
}

/** 串流：與 chatWithVertexRagGrounding 同一路徑（augment 時勿強制 retrieve-first） */
export async function* streamVertexRagGroundedChat(
  message: string,
  profile?: SalesQuestionProfile,
): AsyncGenerator<SalesChatStreamEvent> {
  const resolved = profile ?? classifySalesQuestion(message);

  yield { type: "status", text: "正在檢索知識庫…" };

  if (!useGroundedRetrieveFirst()) {
    try {
      const grounded = await chatWithVertexRagGrounding(message, resolved);
      if (!grounded.rawText.trim() && grounded.citations.length === 0) {
        yield {
          type: "done",
          result: {
            reply:
              "目前題庫中尚無此問題的標準話術。是否要將此問題加入「待新增題庫清單」，由話術管理窗口後續建檔？",
            bullets: [],
            citations: [],
            inQuestionBank: false,
            allowAddRequest: true,
            question: message,
          },
        };
        return;
      }

      const guardReply = groundedGuardRejectReply(message, grounded.citations, resolved);
      if (guardReply) {
        yield groundedGuardRejectStreamDone(message, guardReply);
        return;
      }

      const prep = prepareCitationCards(grounded.citations);
      yield {
        type: "citations_ready",
        citations: prep.cards,
        citationsOverflow: prep.overflowCount > 0 ? prep.overflowCount : undefined,
      };

      yield { type: "status", text: "正在整理回覆…" };

      const maxDocId = visibleCitationDocCount(grounded.citations);
      const clean = sanitizeReplyCitationMarkers(grounded.intro, grounded.bullets, maxDocId);
      const replyText = clean.intro.trim();

      if (replyText) {
        yield { type: "intro_delta", text: replyText };
      }

      yield {
        type: "done",
        result: {
          reply:
            replyText ||
            clean.bullets[0]?.slice(0, 120) ||
            "暫時無法產生回覆，請換個方式提問。",
          bullets: clean.bullets,
          citations: prep.cards,
          citationsOverflow: prep.overflowCount > 0 ? prep.overflowCount : undefined,
          inQuestionBank: true,
        },
      };
      return;
    } catch (e) {
      console.error("[rag] stream augment/native grounding failed", e);
      yield { type: "error", message: e instanceof Error ? e.message : "RAG 回答失敗" };
      return;
    }
  }

  let facts: Array<{ title: string; text: string; uri?: string }> = [];
  try {
    facts = await retrieveGroundedFacts(message, resolved);
  } catch (e) {
    console.error("[rag] stream retrieve failed", e);
    yield { type: "error", message: e instanceof Error ? e.message : "檢索失敗" };
    return;
  }

  if (facts.length === 0) {
    yield {
      type: "done",
      result: {
        reply: "目前題庫中尚無此問題的標準話術。是否要將此問題加入「待新增題庫清單」，由話術管理窗口後續建檔？",
        bullets: [],
        citations: [],
        inQuestionBank: false,
        allowAddRequest: true,
        question: message,
      },
    };
    return;
  }

  const citations = chunksToCitations(message, facts);
  const guardReply = groundedGuardRejectReply(message, citations, resolved);
  if (guardReply) {
    yield groundedGuardRejectStreamDone(message, guardReply);
    return;
  }

  const prep = prepareCitationCards(citations);
  yield {
    type: "citations_ready",
    citations: prep.cards,
    citationsOverflow: prep.overflowCount > 0 ? prep.overflowCount : undefined,
  };

  yield { type: "status", text: "正在整理回覆…" };

  const merged = await chatWithMergedFactsGrounding(message, resolved, facts);
  const maxDocId = visibleCitationDocCount(merged.citations);
  const clean = sanitizeReplyCitationMarkers(merged.intro, merged.bullets, maxDocId);
  const replyText = clean.intro.trim();

  if (replyText) {
    yield { type: "intro_delta", text: replyText };
  }

  yield {
    type: "done",
    result: {
      reply: replyText || clean.bullets[0]?.slice(0, 120) || "暫時無法產生回覆，請換個方式提問。",
      bullets: clean.bullets,
      citations: prep.cards,
      citationsOverflow: prep.overflowCount > 0 ? prep.overflowCount : undefined,
      inQuestionBank: true,
    },
  };
}

export function isRagGroundedAnswerMode(): boolean {
  const mode = (process.env.SALES_RAG_ANSWER_MODE ?? "").trim().toLowerCase();
  if (mode === "grounded" || mode === "rag-grounding") return true;
  const chat = (process.env.SALES_CHAT_MODE ?? "").trim().toLowerCase();
  return chat === "grounded" || chat === "rag-grounded";
}
