import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGcpAccessToken } from "../src/lib/gemini/gemini-client";
import { getRagProjectId, getRagLocation } from "../src/lib/rag/rag-engine-config";

const STORE =
  "projects/653828324568/locations/global/collections/default_collection/dataStores/ynm-poc-sales-script-w7e5m5";

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
  const location = getRagLocation();
  const host =
    location === "global"
      ? "https://discoveryengine.googleapis.com"
      : `https://${location}-discoveryengine.googleapis.com`;
  const token = await getGcpAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-goog-user-project": getRagProjectId(),
  };
  const res = await fetch(`${host}/v1/${STORE}/branches/0/documents/xtrail-hp-demo`, { headers });
  console.log(await res.text());
}

main().catch(console.error);
