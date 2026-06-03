import { getGcpAccessToken } from "@/lib/gemini/gemini-client";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { normalizeMaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import {
  getDataStoreMeta,
  ragDatastoreMisconfiguredMessage,
} from "@/lib/rag/rag-datastore-meta";
import { searchDatastoreViaDocumentList } from "@/lib/rag/rag-list-fallback";
import { discoveryApiHost, isEngineResource } from "@/lib/rag/rag-resource";
import {
  getRagLocation,
  getRagQuotaProjectId,
  normalizeDataStoreResource,
} from "@/lib/rag/rag-engine-config";

export type RagChunkHit = {
  title: string;
  snippet: string;
  uri?: string;
  materialCategory: MaterialCategory;
  /** Discovery Engine 相關度（愈高愈相關） */
  relevance: number;
  productLine?: string;
};

export class RagSearchError extends Error {
  readonly needsReauth: boolean;
  readonly misconfigured?: boolean;

  constructor(message: string, needsReauth = false, misconfigured = false) {
    super(message);
    this.name = "RagSearchError";
    this.needsReauth = needsReauth;
    this.misconfigured = misconfigured;
  }
}

function isReauthError(message: string): boolean {
  return /invalid_grant|invalid_rapt|reauth|Could not load the default credentials/i.test(
    message,
  );
}

function servingConfigName(parentResource: string): string {
  const base = parentResource.trim().replace(/\/+$/, "");
  if (base.includes("/servingConfigs/")) return base;
  return `${base}/servingConfigs/default_search`;
}

function resolveSearchParent(dataStoreOrEngine: string): string {
  const t = dataStoreOrEngine.trim().replace(/\/+$/, "");
  if (isEngineResource(t)) return t;
  return normalizeDataStoreResource(t);
}

function searchUrl(parentResource: string): string {
  const name = servingConfigName(resolveSearchParent(parentResource));
  return `${discoveryApiHost(getRagLocation())}/v1/${name}:search`;
}

function pickString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function extractSnippetFromDerived(derived: Record<string, unknown>): string {
  const snippets = derived.snippets;
  if (Array.isArray(snippets) && snippets.length > 0) {
    for (const item of snippets) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const s = pickString(row.snippet, row.content, row.htmlSnippet);
      if (s) return s;
    }
  }

  const extractive = derived.extractive_answers;
  if (Array.isArray(extractive) && extractive.length > 0) {
    const parts: string[] = [];
    for (const item of extractive) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const s = pickString(row.content, row.text, row.snippet);
      if (s) parts.push(s);
    }
    if (parts.length) return parts.join(" ");
  }

  return pickString(
    derived.snippet,
    derived.content,
    derived.text,
    derived.description,
  );
}

function decodeRawBytes(content: Record<string, unknown> | undefined): string {
  const raw = content?.rawBytes;
  if (typeof raw !== "string" || !raw) return "";
  try {
    return Buffer.from(raw, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function structCategory(
  derived: Record<string, unknown>,
  fallback: MaterialCategory,
): MaterialCategory {
  return normalizeMaterialCategory(
    pickString(derived.material_category, derived.materialCategory) || fallback,
  );
}

function parseSearchResult(
  result: Record<string, unknown>,
  materialCategory: MaterialCategory,
  rank: number,
): RagChunkHit | null {
  const chunk = result.chunk as Record<string, unknown> | undefined;
  if (chunk) {
    const meta = (chunk.documentMetadata ?? {}) as Record<string, unknown>;
    const struct = (meta.structData ?? meta.struct_data ?? {}) as Record<string, unknown>;
    const title = pickString(struct.title, meta.title, chunk.name);
    const snippet =
      pickString(chunk.content, chunk.relevantChunk, chunk.snippet) ||
      extractSnippetFromDerived(struct);
    const body = snippet || title;
    if (!body || body.length < 2) return null;
    const rankSignals = result.rankSignals as Record<string, unknown> | undefined;
    const relevance =
      Number(rankSignals?.semanticSimilarityScore ?? rankSignals?.relevanceScore ?? 0) ||
      Math.max(1, 100 - rank);
    return {
      title: title || body.slice(0, 120),
      snippet: snippet || body,
      uri: pickString(struct.source_locator, struct.link, struct.uri, struct.url) || undefined,
      materialCategory: structCategory(struct, materialCategory),
      relevance,
      productLine: pickString(struct.product_line, struct.productLine) || undefined,
    };
  }

  const doc = (result.document ?? result) as Record<string, unknown>;
  const derived = (doc.derivedStructData ?? doc.structData ?? {}) as Record<string, unknown>;
  const content = doc.content as Record<string, unknown> | undefined;
  const title = pickString(derived.title, derived.name, doc.id, doc.name);
  const snippet = extractSnippetFromDerived(derived) || decodeRawBytes(content);
  const uri = pickString(derived.link, derived.uri, derived.url, derived.source_locator);
  const body = snippet || title;
  if (!body || body.length < 2) return null;

  const rankSignals = result.rankSignals as Record<string, unknown> | undefined;
  const relevance =
    Number(rankSignals?.semanticSimilarityScore ?? rankSignals?.relevanceScore ?? 0) ||
    Math.max(1, 100 - rank);

  return {
    title: title || body.slice(0, 120),
    snippet: snippet || body,
    uri: uri || undefined,
    materialCategory: structCategory(derived, materialCategory),
    relevance,
    productLine: pickString(derived.product_line, derived.productLine) || undefined,
  };
}

type SearchResponse = {
  results?: Record<string, unknown>[];
  totalSize?: number;
};

function buildContentSearchSpec(contentConfig: string): Record<string, unknown> {
  const base = { snippetSpec: { returnSnippet: true } };
  if (contentConfig === "CONTENT_REQUIRED") {
    return { ...base, searchResultMode: "CHUNKS" };
  }
  return base;
}

function parseHitsFromResponse(
  json: SearchResponse,
  materialCategory: MaterialCategory,
): RagChunkHit[] {
  const hits: RagChunkHit[] = [];
  for (let i = 0; i < (json.results?.length ?? 0); i++) {
    const row = json.results?.[i];
    if (!row || typeof row !== "object") continue;
    const hit = parseSearchResult(row as Record<string, unknown>, materialCategory, i);
    if (hit) hits.push(hit);
  }
  return hits;
}

async function runDiscoverySearch(
  parentResource: string,
  query: string,
  materialCategory: MaterialCategory,
  pageSize: number,
  contentConfig: string,
): Promise<RagChunkHit[]> {
  const parent = resolveSearchParent(parentResource);
  const servingConfig = servingConfigName(parent);
  const token = await getGcpAccessToken();
  const res = await fetch(searchUrl(parent), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": getRagQuotaProjectId(parent),
    },
    body: JSON.stringify({
      servingConfig,
      query: query.trim(),
      pageSize: Math.min(Math.max(pageSize, 1), 25),
      contentSearchSpec: buildContentSearchSpec(contentConfig),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    const needsReauth = res.status === 401 || isReauthError(text);
    const licenseInactive = /LICENSE_INACTIVE|active license/i.test(text);
    if (licenseInactive) {
      throw new RagSearchError(
        "Agent Search 授權未啟用（LICENSE_INACTIVE）。請使用 data store 直接檢索（勿設 RAG_ENGINE_ID），或於 Console 續訂 Search 方案。",
        false,
        true,
      );
    }
    throw new RagSearchError(
      `Agent Search 查詢失敗 (${res.status}): ${text.slice(0, 240)}`,
      needsReauth,
    );
  }

  let json: SearchResponse;
  try {
    json = JSON.parse(text) as SearchResponse;
  } catch {
    throw new RagSearchError("Agent Search 回應無法解析");
  }

  let hits = parseHitsFromResponse(json, materialCategory);

  if (hits.length === 0 && contentConfig === "CONTENT_REQUIRED") {
    const docModeRes = await fetch(searchUrl(parent), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-goog-user-project": getRagQuotaProjectId(parent),
      },
      body: JSON.stringify({
        servingConfig,
        query: query.trim(),
        pageSize: Math.min(Math.max(pageSize, 1), 25),
        contentSearchSpec: {
          snippetSpec: { returnSnippet: true },
          searchResultMode: "DOCUMENTS",
        },
      }),
    });
    if (docModeRes.ok) {
      const docJson = JSON.parse(await docModeRes.text()) as SearchResponse;
      hits = parseHitsFromResponse(docJson, materialCategory);
    }
  }

  return hits;
}

/**
 * 對單一 Vertex AI Search data store 執行 search（ADC）。
 */
export async function searchDiscoveryEngineDatastore(
  dataStoreResource: string,
  query: string,
  materialCategory: MaterialCategory,
  pageSize = 8,
): Promise<RagChunkHit[]> {
  const q = query.trim();
  if (!q) return [];

  const store = normalizeDataStoreResource(dataStoreResource);
  if (!store) return [];

  const meta = await getDataStoreMeta(store);
  const misconfig = ragDatastoreMisconfiguredMessage(meta);
  if (misconfig) {
    throw new RagSearchError(misconfig, false, true);
  }

  let hits: RagChunkHit[] = [];
  try {
    hits = await runDiscoverySearch(store, q, materialCategory, pageSize, meta.contentConfig);
  } catch (e) {
    if (e instanceof RagSearchError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new RagSearchError(msg, isReauthError(msg));
  }

  if (hits.length === 0 && meta.contentConfig === "CONTENT_REQUIRED") {
    const fallback = await searchDatastoreViaDocumentList(
      store,
      q,
      materialCategory,
      pageSize,
    );
    if (fallback.length > 0) {
      if (process.env.NODE_ENV === "development") {
        console.info("[rag] list fallback hits", { store: store.slice(-40), n: fallback.length });
      }
      return fallback;
    }
  }

  return hits;
}

/** 從完整 engine 路徑搜尋（環境變數 RAG_ENGINE_ID）；授權不足時請改 data store。 */
export async function searchDiscoveryEngineEngine(
  engineResource: string,
  query: string,
  materialCategory: MaterialCategory,
  pageSize = 8,
): Promise<RagChunkHit[]> {
  const engine = engineResource.trim().replace(/\/+$/, "");
  if (!engine.includes("/engines/")) {
    return searchDiscoveryEngineDatastore(engine, query, materialCategory, pageSize);
  }
  return runDiscoverySearch(engine, query, materialCategory, pageSize, "CONTENT_REQUIRED");
}

export function getRagProjectIdForLog(): string {
  return getRagQuotaProjectId();
}
