import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { searchKnowledgeByPlanRag } from "../src/lib/gemini/knowledge-search-rag";
import { searchKnowledgeHitsByPlan } from "../src/lib/gemini/knowledge-search-planned";
import { assessSalesQueryAnswerability } from "../src/lib/gemini/query-relevance-guard";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
process.env.SALES_KNOWLEDGE_BACKEND = "rag";

const QS = [
  "TUCSON L 長期持有成本",
  "我試乘時候，好像會聽到異音 這是怎麼回事",
  "XFORCE的特色",
  "XFORCE 跟 X-TRAIL 比較",
];

async function main() {
  for (const q of QS) {
    console.log("\n" + "=".repeat(56));
    console.log("Q:", q);
    const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
    console.log("profile:", profile.category, profile.confidence, "plan cat:", plan.scope.materialCategory);

    const pool = await searchKnowledgeHitsByPlan(q, plan, profile);
    console.log("pool:", pool.length, pool.slice(0, 3).map((h) => h.customer_question?.slice(0, 50)));

    const cites = await searchKnowledgeByPlanRag(q, plan, profile);
    console.log("citations:", cites.length);
    cites.forEach((c) => console.log(`  [${c.index}] ${c.question.slice(0, 90)}`));

    const post = assessSalesQueryAnswerability(q, cites, { questionCategory: profile.category });
    console.log("guard post:", post.ok, post.userReply?.slice(0, 60) ?? "");

    const chat = await chatWithDataAgent(q, { productLine: "xtrail-ice" });
    console.log("chat ok:", chat.inQuestionBank, "| cites:", chat.citations.length);
    console.log("reply:", chat.reply.slice(0, 100));
    chat.citations.forEach((c) => console.log(`  foot [${c.index}] ${c.question.slice(0, 80)}`));
  }
}

main().catch(console.error);
