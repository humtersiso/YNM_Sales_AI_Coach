/**
 * 探測 Vertex AI RAG Engine（asia-east1）語料庫與 retrieveContexts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGcpAccessToken } from "../src/lib/gemini/gemini-client";
import { buildRagRetrievalConfig } from "../src/lib/rag/rag-engine-config";

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
  const projectId = process.env.RAG_PROJECT_ID ?? "gen-lang-client-0927009312";
  const location = process.env.RAG_ENGINE_LOCATION ?? "asia-east1";
  const host = `https://${location}-aiplatform.googleapis.com`;
  const token = await getGcpAccessToken();

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const parent = `projects/${projectId}/locations/${location}`;
  const listRes = await fetch(`${host}/v1/${parent}/ragCorpora`, { headers });
  console.log("List ragCorpora", listRes.status);
  const listText = await listRes.text();
  console.log(listText.slice(0, 4000));

  let corpora: { name?: string; displayName?: string }[] = [];
  try {
    corpora = (JSON.parse(listText) as { ragCorpora?: typeof corpora }).ragCorpora ?? [];
  } catch {
    return;
  }

  const target =
    corpora.find((c) => /sales-script/i.test(c.displayName ?? "") || /sales-script/i.test(c.name ?? "")) ??
    corpora[0];
  if (!target?.name) {
    console.log("No corpus to test");
    return;
  }

  console.log("\nTest retrieve on", target.displayName, target.name);
  const body = {
    vertex_rag_store: {
      rag_resources: [{ rag_corpus: target.name }],
    },
    query: {
      text: "X-TRAIL 馬力",
      rag_retrieval_config: buildRagRetrievalConfig(3),
    },
  };

  const retrieveRes = await fetch(`${host}/v1/${parent}:retrieveContexts`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  console.log("retrieveContexts", retrieveRes.status);
  console.log((await retrieveRes.text()).slice(0, 3000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
