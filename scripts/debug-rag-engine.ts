import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGcpAccessToken } from "../src/lib/gemini/gemini-client";
import { getRagLocation, getRagProjectId } from "../src/lib/rag/rag-engine-config";

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

async function search(serving: string, query: string) {
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
    body: JSON.stringify({
      servingConfig: serving,
      query,
      pageSize: 5,
      contentSearchSpec: { snippetSpec: { returnSnippet: true } },
    }),
  });
  const text = await res.text();
  console.log("\n", serving.split("/").slice(-2).join("/"), "status", res.status);
  console.log(text.slice(0, 2500));
}

async function main() {
  loadEnv();
  const base =
    "projects/653828324568/locations/global/collections/default_collection/engines";
  await search(`${base}/gemini-enterprise-test_1765266943758/servingConfigs/default_search`, "X-TRAIL");
  await search(`${base}/gemini-enterprise-17708871_1770887112402/servingConfigs/default_search`, "X-TRAIL");
}

main().catch(console.error);
