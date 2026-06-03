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

async function main() {
  loadEnv();
  const projectId = "653828324568";
  const location = getRagLocation();
  const host =
    location === "global"
      ? "https://discoveryengine.googleapis.com"
      : `https://${location}-discoveryengine.googleapis.com`;
  const parent = `projects/${projectId}/locations/${location}/collections/default_collection`;
  const token = await getGcpAccessToken();
  const dataStoreId = `ynm-poc-sales-script-${Date.now().toString(36).slice(-6)}`;
  const res = await fetch(`${host}/v1/${parent}/dataStores?dataStoreId=${dataStoreId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": getRagProjectId(),
    },
    body: JSON.stringify({
      displayName: "YNM PoC Sales Script",
      industryVertical: "GENERIC",
      solutionTypes: ["SOLUTION_TYPE_SEARCH"],
      contentConfig: "CONTENT_REQUIRED",
    }),
  });
  console.log("create", res.status, await res.text());
}

main().catch(console.error);
