import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchVertexRagCorpus } from "../src/lib/rag/vertex-rag-search";
import type { MaterialCategory } from "../src/lib/ingest/contracts/material-category-contract";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const CORPORA: { cat: MaterialCategory; env: string }[] = [
  { cat: "sales_script", env: "RAG_CORPUS_SALES_SCRIPT" },
  { cat: "competitor_compare", env: "RAG_CORPUS_COMPETITOR" },
  { cat: "product_info", env: "RAG_CORPUS_PRODUCT" },
];

const QS = ["204 ps", "最大馬力", "X-TRAIL 馬力", "30.6 kgm", "VC-TURBO 馬力"];

async function main() {
  for (const { cat, env } of CORPORA) {
    const corpus = process.env[env] ?? "";
    console.log("\n===", cat, "===");
    for (const q of QS) {
      const hits = await searchVertexRagCorpus(corpus, q, cat, 8);
      const with204 = hits.filter((h) => /204\s*ps|204ps|30\.6\s*kgm/i.test(h.snippet));
      console.log(q, "hits", hits.length, "with204", with204.length, with204[0]?.title?.slice(0, 50) ?? "-");
    }
  }
}

main().catch(console.error);
