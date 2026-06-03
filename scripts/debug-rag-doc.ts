import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGcpAccessToken } from "../src/lib/gemini/gemini-client";
import { getRagLocation, getRagProjectId } from "../src/lib/rag/rag-engine-config";

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
    "Content-Type": "application/json",
    "x-goog-user-project": getRagProjectId(),
  };

  const text =
    "客戶：X-TRAIL 馬力多少？\n話術：X-TRAIL ICE 搭載 204 ps 最大馬力，扭力 30.6 kgm。";
  const docRes = await fetch(
    `${host}/v1/${STORE}/branches/0/documents?documentId=xtrail-hp-demo`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        structData: {
          title: "X-TRAIL ICE 馬力話術",
          material_category: "sales_script",
          product_line: "xtrail-ice",
        },
        content: { mimeType: "text/plain", rawBytes: Buffer.from(text, "utf8").toString("base64") },
      }),
    },
  );
  console.log("create doc", docRes.status, (await docRes.text()).slice(0, 800));

  await new Promise((r) => setTimeout(r, 45000));

  const listRes = await fetch(`${host}/v1/${STORE}/branches/0/documents?pageSize=5`, { headers });
  console.log("list docs", listRes.status, (await listRes.text()).slice(0, 600));

  const serving = `${STORE}/servingConfigs/default_search`;
  const searchRes = await fetch(`${host}/v1/${serving}:search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      servingConfig: serving,
      query: "X-TRAIL 馬力",
      pageSize: 5,
      contentSearchSpec: { snippetSpec: { returnSnippet: true } },
    }),
  });
  console.log("search", searchRes.status, (await searchRes.text()).slice(0, 3000));
}

main().catch(console.error);
