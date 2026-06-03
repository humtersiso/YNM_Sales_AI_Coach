import { createHash } from "node:crypto";
import { getGcpAccessToken } from "@/lib/gemini/gemini-client";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { discoveryApiHost, projectIdFromResource } from "@/lib/rag/rag-resource";
import {
  getRagLocation,
  getRagQuotaProjectId,
  normalizeDataStoreResource,
} from "@/lib/rag/rag-engine-config";

export type RagDocumentInput = {
  documentId: string;
  title: string;
  body: string;
  materialCategory: MaterialCategory;
  productLine: string;
  sourceLocator?: string;
};

export function stableRagDocumentId(parts: string[]): string {
  const raw = parts.join("|");
  return createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 32);
}

function branchParent(dataStoreResource: string): string {
  return `${normalizeDataStoreResource(dataStoreResource)}/branches/0`;
}

export async function upsertRagDocument(
  dataStoreResource: string,
  doc: RagDocumentInput,
): Promise<void> {
  const store = normalizeDataStoreResource(dataStoreResource);
  const host = discoveryApiHost(getRagLocation());
  const token = await getGcpAccessToken();
  const parent = branchParent(store);
  const url = `${host}/v1/${parent}/documents?documentId=${encodeURIComponent(doc.documentId)}`;

  const structData: Record<string, string> = {
    title: doc.title.slice(0, 500),
    material_category: doc.materialCategory,
    product_line: doc.productLine,
  };
  if (doc.sourceLocator?.trim()) structData.source_locator = doc.sourceLocator.trim().slice(0, 500);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": getRagQuotaProjectId(store),
    },
    body: JSON.stringify({
      structData,
      content: {
        mimeType: "text/plain",
        rawBytes: Buffer.from(doc.body, "utf8").toString("base64"),
      },
    }),
  });

  if (res.ok) return;

  const text = await res.text();
  if (res.status === 409 || /ALREADY_EXISTS/i.test(text)) {
    const patchUrl = `${host}/v1/${parent}/documents/${encodeURIComponent(doc.documentId)}`;
    const patchRes = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-goog-user-project": getRagQuotaProjectId(store),
      },
      body: JSON.stringify({
        structData,
        content: {
          mimeType: "text/plain",
          rawBytes: Buffer.from(doc.body, "utf8").toString("base64"),
        },
      }),
    });
    if (patchRes.ok) return;
    throw new Error(`RAG 文件更新失敗 (${patchRes.status}): ${(await patchRes.text()).slice(0, 200)}`);
  }

  throw new Error(`RAG 文件寫入失敗 (${res.status}): ${text.slice(0, 240)}`);
}

export async function createContentRequiredDataStore(
  projectId: string,
  dataStoreId: string,
  displayName: string,
): Promise<string> {
  const location = getRagLocation();
  const host = discoveryApiHost(location);
  const token = await getGcpAccessToken();
  const parent = `projects/${projectId}/locations/${location}/collections/default_collection`;
  const quota = getRagQuotaProjectId();

  const res = await fetch(`${host}/v1/${parent}/dataStores?dataStoreId=${encodeURIComponent(dataStoreId)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": quota,
    },
    body: JSON.stringify({
      displayName,
      industryVertical: "GENERIC",
      solutionTypes: ["SOLUTION_TYPE_SEARCH"],
      contentConfig: "CONTENT_REQUIRED",
    }),
  });

  const text = await res.text();
  if (!res.ok && !/already exists/i.test(text)) {
    throw new Error(`建立 data store 失敗 (${res.status}): ${text.slice(0, 300)}`);
  }

  let json: { response?: { name?: string }; name?: string };
  try {
    json = JSON.parse(text) as { response?: { name?: string }; name?: string };
  } catch {
    json = {};
  }
  const name =
    json.response?.name ??
    `${parent}/dataStores/${dataStoreId}`;
  return normalizeDataStoreResource(name);
}

export function defaultRagProjectId(): string {
  return projectIdFromResource(process.env.RAG_DATASTORE_PRODUCT ?? "") ?? "653828324568";
}
