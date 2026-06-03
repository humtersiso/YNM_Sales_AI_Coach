import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { searchKnowledgeByPlanRag } from "../src/lib/gemini/knowledge-search-rag";
import { searchVertexRagCorpus } from "../src/lib/rag/vertex-rag-search";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
process.env.SALES_KNOWLEDGE_BACKEND = "rag";

const QS = ["馬力", "馬力如何", "X-TRAIL ICE 的馬力如何？", "X-TRAIL 最大扭力多少？"];

async function main() {
  const corpus = process.env.RAG_CORPUS_PRODUCT ?? "";
  const probeQs = ["X-TRAIL 204 ps", "最大馬力 204", "X-TRAIL ICE 最大馬力", "VC-TURBO 204"];
  console.log("\n--- probe queries on product corpus ---");
  for (const pq of probeQs) {
    const hits = await searchVertexRagCorpus(corpus, pq, "product_info", 5);
    const ok = hits.some((h) => /204\s*ps|204ps/i.test(h.snippet));
    console.log(pq, ok ? "HIT" : "miss", hits[0]?.title?.slice(0, 55));
  }

  for (const q of QS) {
    console.log("\n========", q, "========");
    const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
    console.log("profile", profile.category, profile.confidence, "plan limit", plan.limit, "cat", plan.scope.materialCategory);

    const raw = await searchVertexRagCorpus(corpus, q, "product_info", 8);
    const raw204 = raw.filter((h) => /204\s*ps|204ps|30\.6\s*kgm/i.test(h.snippet));
    console.log("raw product top:", raw[0]?.title?.slice(0, 70));
    console.log("raw has 204:", raw204.length > 0, raw204[0]?.snippet?.slice(0, 100).replace(/\s+/g, " "));

    const cites = await searchKnowledgeByPlanRag(q, plan, profile);
    const blob = cites.map((c) => `${c.question}\n${c.script}`).join("\n");
    console.log("citations", cites.length, "has204", /204\s*ps|204ps/i.test(blob));
    for (const c of cites.slice(0, 2)) {
      console.log(" cite:", c.question.slice(0, 60));
      console.log("  snip:", c.script.slice(0, 120).replace(/\s+/g, " "));
    }

    const r = await chatWithDataAgent(q);
    const ans = `${r.reply} ${r.bullets.join(" ")}`;
    console.log("answer has204:", /204\s*ps|204ps/i.test(ans));
    console.log("intro:", r.reply.slice(0, 120));
  }
}

main().catch(console.error);
