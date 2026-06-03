import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchVertexRagCorpus } from "../src/lib/rag/vertex-rag-search";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function loadEnv() {
  for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function main() {
  loadEnv();
  const corpus = process.env.RAG_CORPUS_SALES_SCRIPT ?? "";
  for (const q of [
    "後座都感覺很晃",
    "試乘起來後座都感覺很晃",
    "X-TRAIL 後座搖晃",
  ]) {
    console.log("\n=== query:", q);
    const hits = await searchVertexRagCorpus(corpus, q, "sales_script", 5);
    hits.forEach((h, i) => {
      console.log(i + 1, h.title.slice(0, 60));
      const has = h.snippet.includes("很晃") || h.snippet.includes("搖晃");
      console.log("  has晃", has, h.snippet.slice(0, 200).replace(/\s+/g, " "));
    });
  }
}

main().catch(console.error);
