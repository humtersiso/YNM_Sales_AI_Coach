import fs from "node:fs";
import path from "node:path";
const webRoot = path.join(process.cwd());
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
}
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import { assessSalesQueryAnswerability } from "../src/lib/gemini/query-relevance-guard";
import { searchKnowledgeByPlan } from "../src/lib/gemini/knowledge-search-planned";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";

async function main() {
  const q = "KICKS 有什麼配備?";
  console.log("pre", assessSalesQueryAnswerability(q, []));
  const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "kicks" });
  const cites = await searchKnowledgeByPlan(q, plan, profile);
  console.log("hits", cites.length, profile);
  const r = await chatWithDataAgent(q, { productLine: "kicks" });
  console.log("reply", r.reply.slice(0, 120));
  console.log("cites", r.citations.length, "bank", r.inQuestionBank);
}
void main();
