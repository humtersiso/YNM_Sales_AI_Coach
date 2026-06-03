import { getGcpAccessToken } from "@/lib/gemini/gemini-client";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { normalizeMaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";
import { discoveryApiHost } from "@/lib/rag/rag-resource";
import {
  getRagLocation,
  getRagQuotaProjectId,
  normalizeDataStoreResource,
} from "@/lib/rag/rag-engine-config";

type ListedDoc = {
  id: string;
  title: string;
  body: string;
  materialCategory: MaterialCategory;
  productLine?: string;
  uri?: string;
};

function decodeContent(content: Record<string, unknown> | undefined): string {
  if (!content) return "";
  const raw = content.rawBytes;
  if (typeof raw === "string" && raw.length > 0) {
    try {
      return Buffer.from(raw, "base64").toString("utf8");
    } catch {
      return "";
    }
  }
  return "";
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,，。！？、；：「」『』（）()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreDoc(doc: ListedDoc, tokens: string[], query: string): number {
  const hay = `${doc.title}\n${doc.body}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 12;
  }
  if (query.length >= 4 && hay.includes(query.toLowerCase())) score += 20;
  return score;
}

async function listBranchDocuments(
  dataStoreResource: string,
  maxDocs: number,
): Promise<ListedDoc[]> {
  const store = normalizeDataStoreResource(dataStoreResource);
  const host = discoveryApiHost(getRagLocation());
  const token = await getGcpAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-goog-user-project": getRagQuotaProjectId(store),
  };

  const out: ListedDoc[] = [];
  let pageToken: string | undefined;

  while (out.length < maxDocs) {
    const qs = new URLSearchParams({ pageSize: String(Math.min(50, maxDocs - out.length)) });
    if (pageToken) qs.set("pageToken", pageToken);
    const res = await fetch(`${host}/v1/${store}/branches/0/documents?${qs}`, { headers });
    if (!res.ok) break;
    const json = (await res.json()) as {
      documents?: Record<string, unknown>[];
      nextPageToken?: string;
    };
    for (const row of json.documents ?? []) {
      const struct = (row.structData ?? {}) as Record<string, unknown>;
      const title = String(struct.title ?? row.id ?? "").trim();
      const body = decodeContent(row.content as Record<string, unknown> | undefined);
      if (!title && !body) continue;
      out.push({
        id: String(row.id ?? ""),
        title: title || body.slice(0, 80),
        body: body || title,
        materialCategory: normalizeMaterialCategory(String(struct.material_category ?? "general")),
        productLine: struct.product_line ? String(struct.product_line) : undefined,
        uri: struct.source_locator ? String(struct.source_locator) : undefined,
      });
      if (out.length >= maxDocs) break;
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/**
 * 索引尚未完成時，對 CONTENT_REQUIRED 庫做簡易關鍵字比對（僅後備）。
 */
export async function searchDatastoreViaDocumentList(
  dataStoreResource: string,
  query: string,
  defaultCategory: MaterialCategory,
  pageSize: number,
  filterCategory?: MaterialCategory,
): Promise<RagChunkHit[]> {
  const docs = await listBranchDocuments(dataStoreResource, 200);
  if (docs.length === 0) return [];

  const tokens = tokenize(query);
  const ranked = docs
    .map((doc) => ({
      doc,
      score: scoreDoc(doc, tokens, query),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, pageSize).map(({ doc, score }, i) => ({
    title: doc.title,
    snippet: doc.body.slice(0, 4000),
    uri: doc.uri,
    materialCategory: filterCategory ?? doc.materialCategory ?? defaultCategory,
    relevance: score || Math.max(1, 100 - i),
    productLine: doc.productLine,
  }));
}
