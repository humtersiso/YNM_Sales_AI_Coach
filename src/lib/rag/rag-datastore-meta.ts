import { getGcpAccessToken } from "@/lib/gemini/gemini-client";
import { discoveryApiHost } from "@/lib/rag/rag-resource";
import { getRagLocation, getRagQuotaProjectId, normalizeDataStoreResource } from "@/lib/rag/rag-engine-config";

export type DataStoreContentConfig =
  | "CONTENT_REQUIRED"
  | "PUBLIC_WEBSITE"
  | "NO_CONTENT"
  | "UNKNOWN";

export type DataStoreMeta = {
  resource: string;
  displayName?: string;
  contentConfig: DataStoreContentConfig;
  /** PUBLIC_WEBSITE：目標站是否皆索引失敗 */
  websiteIndexingFailed?: boolean;
};

const metaCache = new Map<string, { at: number; meta: DataStoreMeta }>();
const CACHE_MS = 5 * 60 * 1000;

function parseContentConfig(raw: unknown): DataStoreContentConfig {
  const v = String(raw ?? "").toUpperCase();
  if (v === "CONTENT_REQUIRED" || v === "PUBLIC_WEBSITE" || v === "NO_CONTENT") {
    return v;
  }
  return "UNKNOWN";
}

export async function getDataStoreMeta(dataStoreResource: string): Promise<DataStoreMeta> {
  const resource = normalizeDataStoreResource(dataStoreResource);
  const cached = metaCache.get(resource);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.meta;

  const host = discoveryApiHost(getRagLocation());
  const token = await getGcpAccessToken();
  const res = await fetch(`${host}/v1/${resource}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": getRagQuotaProjectId(resource),
    },
  });

  if (!res.ok) {
    const meta: DataStoreMeta = { resource, contentConfig: "UNKNOWN" };
    metaCache.set(resource, { at: Date.now(), meta });
    return meta;
  }

  const json = (await res.json()) as Record<string, unknown>;
  const meta: DataStoreMeta = {
    resource,
    displayName: typeof json.displayName === "string" ? json.displayName : undefined,
    contentConfig: parseContentConfig(json.contentConfig),
  };

  if (meta.contentConfig === "PUBLIC_WEBSITE") {
    try {
      const sitesRes = await fetch(`${host}/v1/${resource}/siteSearchEngine/targetSites`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-goog-user-project": getRagQuotaProjectId(resource),
        },
      });
      if (sitesRes.ok) {
        const sitesJson = (await sitesRes.json()) as {
          targetSites?: { indexingStatus?: string }[];
        };
        const sites = sitesJson.targetSites ?? [];
        meta.websiteIndexingFailed =
          sites.length > 0 && sites.every((s) => s.indexingStatus === "FAILED");
      }
    } catch {
      /* ignore */
    }
  }

  metaCache.set(resource, { at: Date.now(), meta });
  return meta;
}

export function ragDatastoreMisconfiguredMessage(meta: DataStoreMeta): string | null {
  if (meta.contentConfig === "PUBLIC_WEBSITE") {
    if (meta.websiteIndexingFailed) {
      return (
        "此語料庫為「網站搜尋」類型且目標網站尚未完成驗證／索引（indexingStatus=FAILED），" +
        "無法檢索話術內容。請在 Console 建立 CONTENT_REQUIRED 文件庫並執行 npm run rag:ingest。"
      );
    }
    return (
      "此語料庫為「網站搜尋」類型，不適用話術／簡報文件檢索。" +
      "請改設定 CONTENT_REQUIRED 類型的 data store（見 npm run rag:setup）。"
    );
  }
  if (meta.contentConfig === "NO_CONTENT") {
    return "此語料庫為 NO_CONTENT，無法做文件檢索。";
  }
  return null;
}
