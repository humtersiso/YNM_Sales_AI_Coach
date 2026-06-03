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
  const q = "XFORCE 跟 X-TRAIL 比較";
  const corpus = process.env.RAG_CORPUS_COMPETITOR ?? "";
  const hits = await searchVertexRagCorpus(corpus, q, "competitor_compare", 15);
  console.log("hits", hits.length);
  hits.forEach((h, i) => {
    const has = /xforce/i.test(`${h.title}\n${h.snippet}`);
    console.log(i + 1, has ? "[XFORCE]" : "      ", h.title.slice(0, 70));
  });
}

main().catch(console.error);
