import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { searchKnowledgeByPlanRag } from "../src/lib/gemini/knowledge-search-rag";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
process.env.SALES_KNOWLEDGE_BACKEND = "rag";

const Q = "X-TRAIL 有哪些特色？說來聽聽";

async function main() {
  console.log("BACKEND:", process.env.SALES_KNOWLEDGE_BACKEND);
  console.log("MODE:", process.env.SALES_CHAT_MODE);
  const { plan, profile } = await resolveSearchPlanWithProfile(Q, { productLine: "xtrail-ice" });
  console.log("profile:", profile.category, profile.confidence);

  const cites = await searchKnowledgeByPlanRag(Q, plan, profile);
  console.log("\nRAG citations:", cites.length);
  cites.forEach((c) => {
    console.log(`  [${c.index}] ${c.question}`);
    console.log(`      sourceLabel=${c.sourceLabel} kind=${c.sourceKind}`);
    console.log(`      script head: ${(c.script ?? "").slice(0, 120)}`);
  });

  const chat = await chatWithDataAgent(Q, { productLine: "xtrail-ice" });
  console.log("\nchat inBank:", chat.inQuestionBank, "cites:", chat.citations.length);
  console.log("reply:", chat.reply.slice(0, 200));
  console.log("bullets:", chat.bullets.length, chat.bullets.slice(0, 2));
  chat.citations.forEach((c) => console.log(`  foot [${c.index}] ${c.question}`));
}

main().catch(console.error);
