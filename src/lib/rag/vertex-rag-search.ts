import { getGcpAccessToken } from "@/lib/gemini/gemini-client";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";
import { RagSearchError } from "@/lib/rag/discovery-engine-search";
import {
  extractCustomerQuestionFromRagSnippet,
  formatRagSourceTitle,
} from "@/lib/rag/rag-citation-format";
import {
  buildRagRetrievalConfig,
  getRagCorpusForCategory,
  getRagEngineLocation,
  getRagHybridSearchAlpha,
  getRagProjectId,
} from "@/lib/rag/rag-engine-config";

type RetrieveResponse = {
  contexts?: {
    contexts?: Array<{
      text?: string;
      sourceUri?: string;
      sourceDisplayName?: string;
      score?: number;
      chunk?: {
        text?: string;
        pageSpan?: { firstPage?: number; lastPage?: number };
      };
    }>;
  };
};

function isReauthError(message: string): boolean {
  return /invalid_grant|invalid_rapt|reauth|Could not load the default credentials/i.test(
    message,
  );
}

/**
 * Vertex AI RAG Engine（retrieveContexts，Spanner / 託管向量庫）
 */
export async function searchVertexRagCorpus(
  ragCorpusResource: string,
  query: string,
  materialCategory: MaterialCategory,
  topK = 8,
): Promise<RagChunkHit[]> {
  const q = query.trim();
  if (!q || !ragCorpusResource.includes("/ragCorpora/")) return [];

  const projectId = getRagProjectId();
  const location = getRagEngineLocation();
  const parent = `projects/${projectId}/locations/${location}`;
  const host = `https://${location}-aiplatform.googleapis.com`;

  let token: string;
  try {
    token = await getGcpAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new RagSearchError(
      "無法取得 Google 憑證，請執行 gcloud auth application-default login",
      isReauthError(msg),
    );
  }

  const retrievalConfig = buildRagRetrievalConfig(topK);
  if (process.env.NODE_ENV === "development") {
    const alpha = getRagHybridSearchAlpha();
    console.info("[rag] retrieveContexts config", {
      hybridSearch: alpha != null,
      alpha: alpha ?? undefined,
      top_k: retrievalConfig.top_k,
    });
  }

  const res = await fetch(`${host}/v1/${parent}:retrieveContexts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vertex_rag_store: {
        rag_resources: [{ rag_corpus: ragCorpusResource }],
      },
      query: {
        text: q,
        rag_retrieval_config: retrievalConfig,
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new RagSearchError(
      `RAG Engine 檢索失敗 (${res.status}): ${text.slice(0, 280)}`,
      res.status === 401 || isReauthError(text),
    );
  }

  let json: RetrieveResponse;
  try {
    json = JSON.parse(text) as RetrieveResponse;
  } catch {
    throw new RagSearchError("RAG Engine 回應無法解析");
  }

  const rows = json.contexts?.contexts ?? [];
  const hits: RagChunkHit[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const snippet = (row.chunk?.text ?? row.text ?? "").trim();
    if (!snippet || snippet.length < 4) continue;
    const fileName = (row.sourceDisplayName ?? row.sourceUri ?? "RAG 片段").trim();
    const pageSpan = row.chunk?.pageSpan;
    const page =
      pageSpan?.firstPage != null
        ? { first: pageSpan.firstPage, last: pageSpan.lastPage }
        : undefined;
    const title = formatRagSourceTitle(fileName, page);
    const relevance = typeof row.score === "number" ? Math.round((1 - row.score) * 100) : 100 - i;
    const cq = extractCustomerQuestionFromRagSnippet(snippet);
    hits.push({
      title: cq ? `${cq.slice(0, 80)} · ${title}` : title,
      snippet,
      uri: row.sourceUri
        ? `${row.sourceUri}${page?.first ? `#page=${page.first}` : ""}`
        : undefined,
      materialCategory,
      relevance: Math.max(relevance, 1),
    });
  }
  return hits;
}

export async function searchVertexRagByCategory(
  category: MaterialCategory,
  query: string,
  topK: number,
): Promise<RagChunkHit[]> {
  const corpus = getRagCorpusForCategory(category);
  if (!corpus) return [];
  return searchVertexRagCorpus(corpus.ragCorpusResource, query, category, topK);
}

