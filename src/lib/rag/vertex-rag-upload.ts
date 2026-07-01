import fs from "node:fs";
import path from "node:path";
import { getGcpAccessToken } from "@/lib/gemini/gemini-client";
import { getRagEngineLocation } from "@/lib/rag/rag-engine-config";
import { mimeTypeForExtension } from "@/lib/ingest/contracts/training-source-manifest";

function uploadHost(corpusResource: string): string {
  const m = corpusResource.match(/locations\/([^/]+)/);
  const location = m?.[1] ?? getRagEngineLocation();
  return `https://${location}-aiplatform.googleapis.com`;
}

/** 上傳本機檔案至 Vertex RAG Engine 語料庫（含 PDF／Office；由雲端解析分塊） */
export async function uploadLocalFileToRagCorpus(
  corpusResource: string,
  localPath: string,
  displayName?: string,
): Promise<string> {
  const abs = path.resolve(localPath);
  if (!fs.existsSync(abs)) throw new Error(`檔案不存在: ${abs}`);

  const token = await getGcpAccessToken();
  const host = uploadHost(corpusResource);
  const url = `${host}/upload/v1/${corpusResource}/ragFiles:upload`;
  const fileName = path.basename(abs);
  const label = (displayName ?? fileName).slice(0, 500);
  const ext = path.extname(abs).toLowerCase();
  const mime = mimeTypeForExtension(ext) || "application/octet-stream";
  const fileBuf = fs.readFileSync(abs);

  const metadataObj = { rag_file: { display_name: label } };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadataObj)], { type: "application/json" }));
  form.append("file", new Blob([fileBuf], { type: mime }), fileName);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Goog-Upload-Protocol": "multipart",
    },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`RAG 檔案上傳失敗 (${res.status}): ${text.slice(0, 400)}`);
  }

  try {
    const json = JSON.parse(text) as { name?: string; ragFile?: { name?: string } };
    return json.name ?? json.ragFile?.name ?? label;
  } catch {
    return label;
  }
}

/** 上傳純文字片段（已解析的 Q&A 列） */
export async function uploadTextSnippetToRagCorpus(
  corpusResource: string,
  displayName: string,
  body: string,
): Promise<string> {
  const tmpDir = path.join(process.cwd(), ".deploy-tmp", "rag-upload");
  fs.mkdirSync(tmpDir, { recursive: true });
  const safe = displayName.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, 80);
  const tmpPath = path.join(tmpDir, `${safe}-${Date.now()}.txt`);
  fs.writeFileSync(tmpPath, body, "utf8");
  try {
    return await uploadLocalFileToRagCorpus(corpusResource, tmpPath, displayName);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }
}
