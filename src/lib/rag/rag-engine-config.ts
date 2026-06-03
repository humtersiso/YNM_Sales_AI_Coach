import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { projectIdFromResource } from "@/lib/rag/rag-resource";

export type RagCorpusConfig = {
  materialCategory: MaterialCategory;
  /** Vertex RAG Engine 語料庫（asia-east1 ragCorpora） */
  ragCorpusResource: string;
  /** Discovery Engine data store（舊路徑，選用） */
  dataStoreResource?: string;
};

export function getRagProjectId(): string {
  return (
    process.env.RAG_PROJECT_ID ??
    process.env.GEMINI_VERTEX_PROJECT ??
    process.env.BIGQUERY_PROJECT_ID ??
    "gen-lang-client-0927009312"
  ).trim();
}

export function getRagEngineLocation(): string {
  return (process.env.RAG_ENGINE_LOCATION ?? "asia-east1").trim() || "asia-east1";
}

/**
 * RAG Engine hybrid search（dense + sparse RRF）。
 * alpha ∈ [0,1]：0 偏關鍵字、1 偏向量；建議話術 QA 用 0.4～0.5。
 *
 * 僅 Weaviate 向量庫後端的 retrieveContexts 接受 hybrid_search。
 * Console 預設 ragManagedDb（KNN）不支援，傳入會 400 InvalidArgument。
 */
let ragHybridSearchWarned = false;

export function getRagHybridSearchAlpha(): number | null {
  const disabled = (process.env.RAG_HYBRID_SEARCH ?? "").trim().toLowerCase();
  if (disabled === "false" || disabled === "0" || disabled === "off") return null;

  const raw = (process.env.RAG_HYBRID_SEARCH_ALPHA ?? "").trim();
  const explicitEnable = disabled === "true" || disabled === "1" || disabled === "on";
  if (!raw && !explicitEnable) return null;

  const vectorDb = (process.env.RAG_VECTOR_DB ?? "ragManagedDb").trim().toLowerCase();
  if (vectorDb !== "weaviate") {
    if (!ragHybridSearchWarned) {
      ragHybridSearchWarned = true;
      console.warn(
        "[rag] RAG_HYBRID_SEARCH 已設定，但語料庫後端為 ragManagedDb（KNN），retrieveContexts 不支援 hybrid_search；維持純向量檢索。若改用 Weaviate 語料庫可設 RAG_VECTOR_DB=weaviate。",
      );
    }
    return null;
  }

  if (raw) {
    const n = Number(raw);
    if (Number.isNaN(n)) return null;
    return Math.min(1, Math.max(0, n));
  }
  return 0.45;
}

function specHybridAlphaForWeaviate(): number | null {
  const vectorDb = (process.env.RAG_VECTOR_DB ?? "ragManagedDb").trim().toLowerCase();
  if (vectorDb !== "weaviate") return null;

  const raw = (process.env.RAG_SPEC_HYBRID_ALPHA ?? "0.25").trim();
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  return Math.min(1, Math.max(0, n));
}

export function buildRagRetrievalConfig(
  topK: number,
  options?: { specQuery?: boolean },
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    top_k: Math.min(Math.max(topK, 1), 20),
  };
  /** ragManagedDb（KNN）不支援 hybrid_search；規格題勿強送否則 retrieveContexts 400 → 0 hits */
  const alpha = options?.specQuery ? specHybridAlphaForWeaviate() : getRagHybridSearchAlpha();
  if (alpha != null) {
    config.hybrid_search = { alpha };
  }
  return config;
}

/** 使用 Console「RAG Engine」retrieveContexts（非 Discovery Engine） */
export function useVertexRagEngineApi(): boolean {
  const mode = (process.env.RAG_RETRIEVAL_API ?? "").trim().toLowerCase();
  if (mode === "discovery" || mode === "discovery-engine") return false;
  if (mode === "vertex-rag-engine" || mode === "vertex") return true;
  return listConfiguredRagCorpora().some((c) => c.ragCorpusResource.includes("/ragCorpora/"));
}

/** Discovery Engine API 計費／配額專案 */
export function getRagQuotaProjectId(dataStoreResource?: string): string {
  if (dataStoreResource) {
    const fromPath = projectIdFromResource(dataStoreResource);
    if (fromPath) return fromPath;
  }
  return getRagProjectId();
}

export function getRagLocation(): string {
  return (process.env.RAG_LOCATION ?? "global").trim() || "global";
}

export function normalizeRagCorpusResource(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  if (!t) return "";
  if (t.includes("/ragCorpora/")) return t;
  const id = t.replace(/^ragCorpora\//, "");
  return `projects/${getRagProjectId()}/locations/${getRagEngineLocation()}/ragCorpora/${id}`;
}

/** 正規化為 dataStores/... 的完整 serving 父資源路徑 */
export function normalizeDataStoreResource(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  if (!t) return "";
  if (t.includes("/dataStores/")) {
    if (t.includes("/servingConfigs/")) {
      return t.split("/servingConfigs/")[0] ?? t;
    }
    return t;
  }
  const id = t.replace(/^dataStores\//, "");
  const projectId = getRagQuotaProjectId();
  const location = getRagLocation();
  return `projects/${projectId}/locations/${location}/collections/default_collection/dataStores/${id}`;
}

export function listConfiguredRagCorpora(): RagCorpusConfig[] {
  const pairs: {
    category: MaterialCategory;
    corpusEnv: string;
    storeEnv: string;
  }[] = [
    {
      category: "sales_script",
      corpusEnv: "RAG_CORPUS_SALES_SCRIPT",
      storeEnv: "RAG_DATASTORE_SALES_SCRIPT",
    },
    {
      category: "competitor_compare",
      corpusEnv: "RAG_CORPUS_COMPETITOR",
      storeEnv: "RAG_DATASTORE_COMPETITOR",
    },
    {
      category: "product_info",
      corpusEnv: "RAG_CORPUS_PRODUCT",
      storeEnv: "RAG_DATASTORE_PRODUCT",
    },
  ];
  const out: RagCorpusConfig[] = [];
  for (const { category, corpusEnv, storeEnv } of pairs) {
    const corpusRaw = (process.env[corpusEnv] ?? "").trim();
    const storeRaw = (process.env[storeEnv] ?? "").trim();
    const ragCorpusResource = corpusRaw ? normalizeRagCorpusResource(corpusRaw) : "";
    const dataStoreResource = storeRaw ? normalizeDataStoreResource(storeRaw) : "";

    if (ragCorpusResource.includes("/ragCorpora/")) {
      out.push({
        materialCategory: category,
        ragCorpusResource,
        dataStoreResource: dataStoreResource || undefined,
      });
      continue;
    }
    if (dataStoreResource.includes("/dataStores/")) {
      out.push({
        materialCategory: category,
        ragCorpusResource: "",
        dataStoreResource,
      });
    }
  }
  return out.filter((c) => c.ragCorpusResource || c.dataStoreResource);
}

export function getRagCorpusForCategory(category: MaterialCategory): RagCorpusConfig | null {
  return listConfiguredRagCorpora().find((c) => c.materialCategory === category) ?? null;
}

export function assertRagConfigured(): void {
  const corpora = listConfiguredRagCorpora();
  if (corpora.length === 0) {
    throw new Error(
      "RAG 未設定：請設定 RAG_CORPUS_*（Vertex RAG Engine）或 RAG_DATASTORE_*（Discovery Engine）",
    );
  }
}

let ragConfigWarned = false;

export function warnIfRagPartiallyConfigured(): void {
  if (ragConfigWarned) return;
  const corpora = listConfiguredRagCorpora();
  if (corpora.length > 0 && corpora.length < 3) {
    ragConfigWarned = true;
    console.warn(
      `[rag] 僅設定 ${corpora.length}/3 個語料庫：`,
      corpora.map((c) => c.materialCategory).join(", "),
    );
  }
}
