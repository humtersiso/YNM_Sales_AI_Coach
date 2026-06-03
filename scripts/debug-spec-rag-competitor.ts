import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchVertexRagCorpus } from "../src/lib/rag/vertex-rag-search";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

async function main() {
  const corpus = process.env.RAG_CORPUS_COMPETITOR ?? "";
  const hits = await searchVertexRagCorpus(corpus, "X-TRAIL 馬力", "competitor_compare", 8);
  for (const h of hits) {
    const has = /204\s*ps|204ps/i.test(h.snippet);
    if (!has) continue;
    console.log("---", h.title.slice(0, 70));
    const idx = h.snippet.search(/204\s*ps|204ps/i);
    console.log(h.snippet.slice(Math.max(0, idx - 80), idx + 120).replace(/\s+/g, " "));
  }
}

main().catch(console.error);
