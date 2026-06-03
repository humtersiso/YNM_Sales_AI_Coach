import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { searchKnowledgeByPlanRag } from "../src/lib/gemini/knowledge-search-rag";
import { assessSalesQueryAnswerability, passesCitationRelevanceGate } from "../src/lib/gemini/query-relevance-guard";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

async function dump(q: string) {
  const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
  const cites = await searchKnowledgeByPlanRag(q, plan, profile);
  console.log("\nQ:", q);
  console.log("profile:", profile.category, "cites:", cites.length);
  for (const c of cites) {
    console.log("---", c.question.slice(0, 80));
    console.log(c.script.slice(0, 250).replace(/\s+/g, " "));
  }
  console.log("gate:", passesCitationRelevanceGate(q, cites));
  console.log("assess:", assessSalesQueryAnswerability(q, cites, { questionCategory: profile.category }));
}

async function main() {
  await dump("我試乘時候，好像會聽到異音 這是怎麼回事");
  await dump("XFORCE 跟 X-TRAIL 比較");
}

main().catch(console.error);
