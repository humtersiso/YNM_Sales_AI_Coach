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

async function get(path: string) {
  const location = getRagLocation();
  const host =
    location === "global"
      ? "https://discoveryengine.googleapis.com"
      : `https://${location}-discoveryengine.googleapis.com`;
  const token = await getGcpAccessToken();
  const res = await fetch(`${host}/v1/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": getRagProjectId(),
    },
  });
  const text = await res.text();
  console.log(`GET ${path} -> ${res.status}`);
  console.log(text.slice(0, 4000));
}

async function main() {
  loadEnv();
  const store = normalizeDataStoreResource(process.env.RAG_DATASTORE_PRODUCT ?? "");
  await get(`${store}`);
  await get(`${store}/branches/0/documents?pageSize=5`);
  await get(`projects/${getRagProjectId()}/locations/global/collections/default_collection/dataStores`);
}

main().catch(console.error);
