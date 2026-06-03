/**
 * 除錯 Discovery Engine search 原始回應（勿提交敏感輸出）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGcpAccessToken } from "../src/lib/gemini/gemini-client";
import { getRagLocation, getRagProjectId, normalizeDataStoreResource } from "../src/lib/rag/rag-engine-config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function search(
  label: string,
  body: Record<string, unknown>,
  storeEnv: string,
) {
  loadEnv();
  const store = normalizeDataStoreResource(process.env[storeEnv] ?? "");
  const serving = `${store}/servingConfigs/default_search`;
  const location = getRagLocation();
  const host =
    location === "global"
      ? "https://discoveryengine.googleapis.com"
      : `https://${location}-discoveryengine.googleapis.com`;
  const token = await getGcpAccessToken();
  const res = await fetch(`${host}/v1/${serving}:search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": getRagProjectId(),
    },
    body: JSON.stringify({ servingConfig: serving, query: "X-TRAIL", pageSize: 3, ...body }),
  });
  const text = await res.text();
  console.log(`\n=== ${label} status=${res.status} ===`);
  console.log(text.slice(0, 3500));
}

async function main() {
  loadEnv();
  await search("default (snippet only)", { contentSearchSpec: { snippetSpec: { returnSnippet: true } } }, "RAG_DATASTORE_PRODUCT");
  await search("CHUNKS", { contentSearchSpec: { snippetSpec: { returnSnippet: true }, searchResultMode: "CHUNKS" } }, "RAG_DATASTORE_PRODUCT");
  await search("DOCUMENTS", { contentSearchSpec: { snippetSpec: { returnSnippet: true }, searchResultMode: "DOCUMENTS" } }, "RAG_DATASTORE_PRODUCT");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
