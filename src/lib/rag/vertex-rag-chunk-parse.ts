/**
 * Vertex RAG Engine / augmentPrompt 回傳 chunk 欄位對齊（避免 text 為 undefined）。
 */
import { formatRagSourceTitle } from "@/lib/rag/rag-citation-format";

type JsonRecord = Record<string, unknown>;

function asRecord(v: unknown): JsonRecord | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonRecord) : undefined;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v != null ? [v] : [];
}

function pick(obj: JsonRecord | undefined, ...keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    if (k in obj) return obj[k];
  }
  return undefined;
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s.length >= 4) return s;
  }
  return "";
}

/** 從 retrieveContexts 單筆 context 或 augment fact 抽出正文 */
export function extractRagChunkText(raw: unknown): string {
  const row = asRecord(raw);
  if (!row) return "";

  const chunk = asRecord(pick(row, "chunk"));
  const chunkMeta = asRecord(
    pick(row, "chunkMetadata", "chunk_metadata", "retrievedContext", "retrieved_context"),
  );
  const metaInner = asRecord(pick(chunkMeta, "metadata"));
  const retrieved = asRecord(pick(chunkMeta, "retrievedContext", "retrieved_context"));

  return firstNonEmptyString(
    row.text,
    row.content,
    chunk?.text,
    chunk?.content,
    retrieved?.text,
    retrieved?.content,
    pick(chunkMeta, "text", "content"),
    pick(metaInner, "text", "content"),
    pick(row, "snippet"),
    pick(row, "pageContent", "page_content"),
  );
}

export function extractRagChunkSourceMeta(raw: unknown): {
  fileName: string;
  page?: { first?: number; last?: number };
  uri?: string;
} {
  const row = asRecord(raw);
  if (!row) return { fileName: "RAG 片段" };

  const chunk = asRecord(pick(row, "chunk"));
  const chunkMeta = asRecord(pick(row, "chunkMetadata", "chunk_metadata"));
  const meta = asRecord(pick(chunkMeta, "metadata"));
  const retrieved = asRecord(pick(chunkMeta, "retrievedContext", "retrieved_context"));

  const fileName = String(
    pick(row, "sourceDisplayName", "source_display_name") ??
      pick(chunkMeta, "sourceDisplayName", "source_display_name") ??
      pick(retrieved, "title", "sourceDisplayName", "source_display_name") ??
      pick(meta, "title", "file_name", "filename") ??
      pick(row, "sourceUri", "source_uri", "uri") ??
      pick(chunkMeta, "sourceUri", "source_uri") ??
      "RAG 片段",
  ).trim();

  const pageSpan =
    asRecord(pick(chunk, "pageSpan", "page_span")) ??
    asRecord(pick(chunkMeta, "pageSpan", "page_span")) ??
    asRecord(pick(meta, "pageSpan", "page_span"));

  const first = Number(
    pick(pageSpan, "firstPage", "first_page", "pageNumber", "page_number") ?? NaN,
  );
  const last = Number(pick(pageSpan, "lastPage", "last_page") ?? NaN);

  const page =
    !Number.isNaN(first) && first > 0
      ? {
          first,
          last: !Number.isNaN(last) && last > 0 ? last : undefined,
        }
      : undefined;

  const uri = String(
    pick(row, "sourceUri", "source_uri", "uri") ??
      pick(chunkMeta, "sourceUri", "source_uri") ??
      pick(retrieved, "uri", "sourceUri", "source_uri") ??
      "",
  ).trim();

  return { fileName, page, uri: uri || undefined };
}

/** 開發環境：印出 GCP 原始 hit 結構供對欄位 */
export function logRawRagHit(source: string, raw: unknown, index?: number): void {
  if (process.env.NODE_ENV !== "development" && process.env.RAG_DEBUG_RAW_HIT !== "1") return;

  const row = asRecord(raw);
  const label = index != null ? `${source}#${index}` : source;
  const text = extractRagChunkText(raw);

  console.info(`[rag] raw hit ${label}`, {
    topLevelKeys: row ? Object.keys(row) : [],
    chunkKeys: row?.chunk ? Object.keys(asRecord(row.chunk) ?? {}) : [],
    chunkMetadataKeys: row?.chunkMetadata
      ? Object.keys(asRecord(row.chunkMetadata) ?? {})
      : row?.chunk_metadata
        ? Object.keys(asRecord(row.chunk_metadata) ?? {})
        : [],
    extractedTextLen: text.length,
    extractedPreview: text.slice(0, 120),
  });

  if (!text && row) {
    console.warn(`[rag] raw hit ${label} 無法抽出 text，完整物件：`, JSON.stringify(raw).slice(0, 800));
  }
}

export function ragContextRowToChunk(raw: unknown, index: number): {
  title: string;
  text: string;
  uri?: string;
  pageLabel?: string;
  sourceFileName?: string;
} | null {
  logRawRagHit("retrieveContexts", raw, index);

  const text = extractRagChunkText(raw);
  if (text.length < 4) return null;

  const { fileName, page, uri } = extractRagChunkSourceMeta(raw);
  const title = formatRagSourceTitle(fileName, page);
  const pageLabel =
    page?.first != null
      ? page.last != null && page.last !== page.first
        ? `第 ${page.first}–${page.last} 頁`
        : `第 ${page.first} 頁`
      : undefined;

  return {
    title,
    text,
    uri: uri ? `${uri}${page?.first ? `#page=${page.first}` : ""}` : undefined,
    pageLabel,
    sourceFileName: fileName.replace(/^gs:\/\/[^/]+\//, "").replace(/\.pdf$/i, ""),
  };
}

export function augmentFactToChunk(raw: unknown, index: number): {
  title: string;
  text: string;
  uri?: string;
} | null {
  logRawRagHit("augmentPrompt.fact", raw, index);

  const fact = asRecord(raw);
  if (!fact) return null;

  const text = extractRagChunkText(fact);
  if (text.length < 4) return null;

  const { fileName, uri } = extractRagChunkSourceMeta(fact);
  const title = String(
    pick(fact, "title") ??
      pick(fact, "sourceDisplayName", "source_display_name") ??
      fileName ??
      "RAG 片段",
  ).trim();

  const factUri = String(pick(fact, "uri", "sourceUri", "source_uri") ?? uri ?? "").trim();

  return {
    title: title || "RAG 片段",
    text,
    uri: factUri || undefined,
  };
}

/** 對齊 Vertex retrieveContexts / augment fact → UI 引用欄位 */
export function mapRagContextToUiCitation(
  rawHit: unknown,
  index: number,
): {
  id: number;
  title: string;
  excerpt: string;
  sourceUri: string;
  pageLabel?: string;
} | null {
  logRawRagHit("mapRagContextToUiCitation", rawHit, index);

  const textContent = extractRagChunkText(rawHit);
  if (textContent.length < 4) return null;

  const { fileName, page, uri } = extractRagChunkSourceMeta(rawHit);
  const sourceUri = uri ?? "";
  const title =
    fileName.replace(/^gs:\/\/.*?\//, "").replace(/\.pdf$/i, "") || "未知話術檔案";
  const pageLabel =
    page?.first != null
      ? page.last != null && page.last !== page.first
        ? `第 ${page.first}–${page.last} 頁`
        : `第 ${page.first} 頁`
      : undefined;

  return {
    id: index + 1,
    title,
    excerpt: textContent,
    sourceUri,
    pageLabel,
  };
}

export function parseAugmentFactsFromResponse(json: JsonRecord): Array<{
  title: string;
  text: string;
  uri?: string;
}> {
  const out: Array<{ title: string; text: string; uri?: string }> = [];
  const facts = asArray(json.facts);
  facts.forEach((item, i) => {
    const chunk = augmentFactToChunk(item, i);
    if (chunk) out.push(chunk);
  });
  return out;
}
