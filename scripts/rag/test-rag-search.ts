/**
 * 測試 Vertex AI Search 三語料庫（需 ADC + RAG_DATASTORE_*）
 * 用法：npx tsx scripts/test-rag-search.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listConfiguredRagCorpora, useVertexRagEngineApi } from "../src/lib/rag/rag-engine-config";
import { searchDiscoveryEngineDatastore } from "../src/lib/rag/discovery-engine-search";
import { searchVertexRagCorpus } from "../src/lib/rag/vertex-rag-search";

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
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const SAMPLE_QUERIES: Record<string, string> = {
  sales_script: "客戶覺得配備太陽春怎麼回",
  competitor_compare: "X-TRAIL 跟 CR-V 油耗怎麼比",
  product_info: "X-TRAIL 媒體報導亮點",
};

async function main() {
  loadEnv();
  process.env.SALES_KNOWLEDGE_BACKEND = "rag";

  const corpora = listConfiguredRagCorpora();
  if (corpora.length === 0) {
    console.error("未設定 RAG_DATASTORE_*，請在 .env 填入三語料庫路徑");
    process.exit(1);
  }

  const vertex = useVertexRagEngineApi();
  console.log(
    "API:",
    vertex ? "vertex-rag-engine (asia-east1)" : "discovery-engine",
    "| corpora:",
    corpora.map((c) => c.materialCategory).join(", "),
  );

  for (const corpus of corpora) {
    const q = SAMPLE_QUERIES[corpus.materialCategory] ?? "X-TRAIL 馬力";
    console.log(`\n=== ${corpus.materialCategory} ===`);
    console.log("Query:", q);
    try {
      const hits =
        vertex && corpus.ragCorpusResource.includes("/ragCorpora/")
          ? await searchVertexRagCorpus(corpus.ragCorpusResource, q, corpus.materialCategory, 3)
          : await searchDiscoveryEngineDatastore(
              corpus.dataStoreResource ?? "",
              q,
              corpus.materialCategory,
              3,
            );
      if (hits.length === 0) {
        console.log("(no hits)");
        continue;
      }
      for (const h of hits) {
        console.log("-", h.title.slice(0, 60));
        console.log(" ", h.snippet.slice(0, 120).replace(/\s+/g, " "));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Error:", msg);
      if (/PUBLIC_WEBSITE|CONTENT_REQUIRED|rag:setup/i.test(msg)) {
        console.error("提示：npm run rag:setup → 更新 .env → npm run rag:ingest");
      }
      process.exitCode = 1;
    }
  }
}

main();
