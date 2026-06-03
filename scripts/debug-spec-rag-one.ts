import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { searchKnowledgeByPlanRag } from "../src/lib/gemini/knowledge-search-rag";
import { searchVertexRagCorpus } from "../src/lib/rag/vertex-rag-search";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
process.env.SALES_KNOWLEDGE_BACKEND = "rag";

const Q = "X-TRAIL ICE 的馬力如何？";

async function main() {
  const comp = process.env.RAG_CORPUS_COMPETITOR ?? "";
  const fb = "X-TRAIL ICE 204 ps 30.6 kgm 對戰 SPORTAGE TERRITORY";
  const extra = await searchVertexRagCorpus(comp, fb, "competitor_compare", 6);
  console.log("fallback extra", extra.length, "with204", extra.filter((h) => /204/i.test(h.snippet)).length);

  const { plan, profile } = await resolveSearchPlanWithProfile(Q, { productLine: "xtrail-ice" });
  console.log("plan cat", plan.scope.materialCategory, "limit", plan.limit);
  const cites = await searchKnowledgeByPlanRag(Q, plan, profile);
  console.log("cites", cites.length, cites.map((c) => /204/i.test(c.script)).join(","));
  for (const c of cites) console.log(c.question.slice(0, 60), c.script.slice(0, 80).replace(/\s+/g, " "));
}

main().catch(console.error);
