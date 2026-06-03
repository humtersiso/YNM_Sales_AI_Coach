import { geminiGenerateText, getGcpAccessToken } from "@/lib/gemini/gemini-client";
import {
  formatMarkdownReplyToDisplay,
  normalizeReplyLine,
  type ScriptCitation,
} from "@/lib/gemini/reply-format";
import { SALES_DIRECT_REPLY_RULES } from "@/lib/gemini/sales-reply-directives";
import type { SalesQuestionProfile } from "@/lib/gemini/sales-question-profile";
import { RagSearchError } from "@/lib/rag/discovery-engine-search";
import {
  buildRagRetrievalConfig,
  getRagCorpusForCategory,
  getRagEngineLocation,
  getRagProjectId,
  listConfiguredRagCorpora,
  normalizeRagCorpusResource,
} from "@/lib/rag/rag-engine-config";
import { isSpecNumericQuery } from "@/lib/gemini/spec-query-expand";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { prepareRagHitForDisplay, pdfNameFromHit } from "@/lib/rag/rag-citation-pipeline";
import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";
import { stripRagBoilerplate } from "@/lib/rag/rag-citation-format";

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

function buildSystemInstruction(profile?: SalesQuestionProfile): string {
  const hero = profile?.heroProduct.displayName ?? "X-TRAIL ICE";
  return `你是裕隆日產 ${hero} 銷售話術助手。請依「檢索到的知識庫片段」回答，勿捏造。
${SALES_DIRECT_REPLY_RULES}
- 規格數字（馬力 ps、扭力 kgm、油耗 km/l）若片段有，必須寫出
- 可分段小標，但勿用 markdown 列點符號（- *）`;
}

function selectGroundingCorpus(message: string, profile?: SalesQuestionProfile): string {
  const override = (process.env.RAG_GROUNDING_CORPUS ?? "").trim();
  if (override) return normalizeRagCorpusResource(override);

  let category: MaterialCategory = "product_info";
  if (profile?.category === "competitor") category = "competitor_compare";
  else if (profile?.category === "sales_qa") category = "sales_script";
  else if (
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
    const hit: RagChunkHit = {
      title: chunk.title,
      snippet: chunk.text,
      uri: chunk.uri,
      materialCategory: "general",
      relevance: 100 - citations.length,
    };
    const prepared = prepareRagHitForDisplay(message, hit) ?? {
      ...hit,
      snippet: stripRagBoilerplate(chunk.text).slice(0, 380),
      title: pdfNameFromHit(hit).replace(/\.pdf$/i, "") || chunk.title,
    };
    citations.push({
      index: citations.length + 1,
      question: prepared.title,
      script: prepared.snippet,
      sourceLabel: "RAG Grounding",
      scriptLabel: chunk.uri ? "向量檢索摘錄" : "摘錄",
      sourceKind: "rag-grounding",
    });
  }
  return citations;
}

function textToIntroBullets(raw: string): { intro: string; bullets: string[] } {
  const parsed = formatMarkdownReplyToDisplay(raw);
  if (parsed.bullets.length > 0) return parsed;

  const lines = raw
    .split(/\n+/)
    .map((l) => normalizeReplyLine(l.replace(/^#{1,6}\s*/, "")))
    .filter((l) => l.length >= 8);
  if (lines.length <= 1) {
    return { intro: normalizeReplyLine(raw).slice(0, 280), bullets: [] };
  }
  return { intro: lines[0]!, bullets: lines.slice(1, 6) };
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

function parseAugmentFacts(json: JsonRecord): Array<{ title: string; text: string; uri?: string }> {
  const out: Array<{ title: string; text: string; uri?: string }> = [];
  for (const item of asArray(json.facts)) {
    const fact = asRecord(item);
    const chunk = asRecord(pick(fact, "chunk"));
    const text = String(
      pick(fact, "content") ?? pick(chunk, "text") ?? pick(fact, "text") ?? "",
    ).trim();
    if (text.length < 4) continue;
    const title = String(
      pick(fact, "title") ??
        pick(fact, "sourceDisplayName", "source_display_name") ??
        pick(chunk, "sourceDisplayName", "source_display_name") ??
        "RAG 片段",
    ).trim();
    const uri =
      String(pick(fact, "uri", "sourceUri", "source_uri") ?? "").trim() || undefined;
    out.push({ title, text, uri });
  }
  return out;
}

/** augmentPrompt：RAG 注入 + 任意 Gemini 生成（asia-east1 無 native grounding 模型時的 Console 等價路徑） */
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

  const facts = parseAugmentFacts(json);

  const genPrompt = [
    buildSystemInstruction(profile),
    "",
    "以下為知識庫檢索注入內容（請僅依此回答）：",
    augmentedText || facts.map((f) => f.text).join("\n\n---\n\n"),
    "",
    `使用者問題：${q}`,
    "請直接回答，規格數字若片段有必須寫出。",
  ].join("\n");

  const rawText = (await geminiGenerateText(genPrompt, {
    temperature: 0.25,
    maxOutputTokens: Number(process.env.RAG_GROUNDING_MAX_OUTPUT_TOKENS ?? "2048") || 2048,
  })) ?? "";

  if (!rawText.trim() && facts.length === 0) {
    throw new RagSearchError("augmentPrompt 未回傳可用內容");
  }

  const citeChunks =
    facts.length > 0
      ? facts
      : [{ title: "RAG 注入", text: augmentedText.slice(0, 1200) }];
  const { intro, bullets } = textToIntroBullets(rawText);
  const citations = chunksToCitations(q, citeChunks);

  if (process.env.NODE_ENV === "development") {
    console.info("[rag] augmentPrompt grounding", {
      corpus: ragCorpus.split("/ragCorpora/").pop(),
      top_k: topK,
      facts: facts.length,
      answerLen: rawText.length,
    });
  }

  return {
    intro: intro || rawText.slice(0, 280),
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
    systemInstruction: { parts: [{ text: buildSystemInstruction(profile) }] },
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
      maxOutputTokens: Number(process.env.RAG_GROUNDING_MAX_OUTPUT_TOKENS ?? "2048") || 2048,
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
    const { intro, bullets } = textToIntroBullets(rawText);
    const citations = chunksToCitations(q, chunks);

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
      intro: intro || rawText.slice(0, 280),
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
  const q = message.trim();
  if (!q) {
    return { intro: "", bullets: [], citations: [], model: "", chunkCount: 0, rawText: "" };
  }

  const ragCorpus = selectGroundingCorpus(q, profile);
  if (!ragCorpus.includes("/ragCorpora/")) {
    throw new RagSearchError("RAG Grounding 未設定：請設定 RAG_CORPUS_* 或 RAG_GROUNDING_CORPUS");
  }

  const projectId = getRagProjectId();
  const location = getRagEngineLocation();
  const parent = `projects/${projectId}/locations/${location}`;
  const topK = groundingTopK();
  const retrievalConfig = buildRagRetrievalConfig(topK);

  let token: string;
  try {
    token = await getGcpAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new RagSearchError(`無法取得 Google 憑證：${msg}`, /invalid_grant|reauth/i.test(msg));
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

export function isRagGroundedAnswerMode(): boolean {
  const mode = (process.env.SALES_RAG_ANSWER_MODE ?? "").trim().toLowerCase();
  if (mode === "grounded" || mode === "rag-grounding") return true;
  const chat = (process.env.SALES_CHAT_MODE ?? "").trim().toLowerCase();
  return chat === "grounded" || chat === "rag-grounded";
}
