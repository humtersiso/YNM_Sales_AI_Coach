import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assessSalesQueryAnswerability, detectUnknownKnowledgeSubjects } from "../src/lib/gemini/query-relevance-guard";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { searchKnowledgeByPlanRag } from "../src/lib/gemini/knowledge-search-rag";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
process.env.SALES_KNOWLEDGE_BACKEND = "rag";

const QS = ["MUFASA 比較如何", "XFORCE的特色", "KUGA ALL NEW VS  X-TRAIL"];

async function main() {
  for (const q of QS) {
    console.log("\n===", q, "===");
    console.log("unknown:", detectUnknownKnowledgeSubjects(q));
    console.log("pre []:", assessSalesQueryAnswerability(q, []));
    const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
    const cites = await searchKnowledgeByPlanRag(q, plan, profile);
    console.log("cites", cites.length, cites[0]?.question?.slice(0, 60));
    console.log("post:", assessSalesQueryAnswerability(q, cites, { questionCategory: profile.category }));
  }
}

main().catch(console.error);
