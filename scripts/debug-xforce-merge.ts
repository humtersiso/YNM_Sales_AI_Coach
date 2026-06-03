import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { extractFileHints } from "../src/lib/gemini/knowledge-search";
import { extractMentionedCompetitor } from "../src/lib/gemini/sales-question-profile";
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
  const { plan } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
  const parts = new Set<string>();
  for (const h of [...(plan.extraFileHints ?? []), ...extractFileHints(q)]) parts.add(h);
  const comp = extractMentionedCompetitor(q);
  if (comp) parts.add(comp);
  const query = `${[...parts].join(" ")} ${q}`.trim();
  console.log("built query:", query);

  for (const [name, corpus, cat] of [
    ["comp", process.env.RAG_CORPUS_COMPETITOR, "competitor_compare"],
    ["sales", process.env.RAG_CORPUS_SALES_SCRIPT, "sales_script"],
    ["product", process.env.RAG_CORPUS_PRODUCT, "product_info"],
  ] as const) {
    const hits = await searchVertexRagCorpus(corpus ?? "", query, cat, 6);
    const xf = hits.filter((h) => /xforce/i.test(`${h.title}\n${h.snippet}`)).length;
    console.log(name, "hits", hits.length, "xforce", xf, hits[0]?.title?.slice(0, 55));
  }
}

main().catch(console.error);
