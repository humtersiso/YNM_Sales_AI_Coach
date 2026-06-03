import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
}

import { detectUnknownKnowledgeSubjects, assessSalesQueryAnswerability } from "../src/lib/gemini/query-relevance-guard";
import { classifySalesQuestion } from "../src/lib/gemini/sales-question-profile";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import { searchKnowledgeByPlan } from "../src/lib/gemini/knowledge-search-planned";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { questionSimilarity } from "../src/lib/analytics/question-dedup";

const Q1 = "為什麼你們X-TRAIL試乘起來後座都感覺很晃啊?";
const Q2 = "引擎呢?";

async function bqShake() {
  const { getBigQueryClient } = await import("../src/lib/bq/script-drills-insert");
  const { getBigQueryDataset, getBigQueryProjectId, getSalesKnowledgeTableId } = await import(
    "../src/lib/bq/knowledge-config"
  );
  const p = getBigQueryProjectId()!;
  const d = getBigQueryDataset();
  const t = getSalesKnowledgeTableId();
  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: `SELECT customer_question, title, SUBSTR(standard_script_idea, 1, 400) AS s, source_locator
      FROM \`${p}.${d}.${t}\`
      WHERE LOWER(standard_script_idea) LIKE '%晃%'
         OR LOWER(customer_question) LIKE '%試乘%後座%'
      LIMIT 6`,
  });
  console.log("\n======== BQ 晃/後座");
  for (const r of rows as Record<string, string>[]) {
    console.log(r.source_locator, r.customer_question?.slice(0, 80));
    console.log(" ", r.s?.replace(/\s+/g, " ").slice(0, 200));
  }
}

async function main() {
  await bqShake();
  for (const q of [Q1, Q2]) {
    console.log("\n========", q);
    console.log("unknown subjects:", detectUnknownKnowledgeSubjects(q));
    console.log("profile:", classifySalesQuestion(q).category);
    const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
    const cites = await searchKnowledgeByPlan(q, plan, profile);
    console.log("citations:", cites.length);
    for (const c of cites.slice(0, 3)) {
      const sim = questionSimilarity(q, `${c.question}\n${c.script.slice(0, 500)}`);
      console.log(" - sim", sim.toFixed(3), c.question?.slice(0, 55));
    }
    const ans = assessSalesQueryAnswerability(q, cites, { questionCategory: profile.category });
    console.log("answerability:", ans.ok, ans.userReply?.slice(0, 50) ?? "");
  }

  const { plan: p1, profile: pr1 } = await resolveSearchPlanWithProfile(Q1, { productLine: "xtrail-ice" });
  const cites1 = await searchKnowledgeByPlan(Q1, p1, pr1);
  if (cites1[0]) {
    console.log("\n======== Q1 citation:", cites1[0].question, "scriptLen", cites1[0].script?.length ?? 0);
    console.log(cites1[0].script?.slice(0, 220).replace(/\s+/g, " ") || "(empty)");
  }

  console.log("\n======== CHAT Q1");
  const r1 = await chatWithDataAgent(Q1, { productLine: "xtrail-ice" });
  console.log("reply:", r1.reply.slice(0, 120));
  console.log("bullets:", r1.bullets.length, "citations:", r1.citations.length);
  console.log("outOfScope?", r1.reply.includes("知識庫內容不符"));

  console.log("\n======== CHAT Q2");
  const r2 = await chatWithDataAgent(Q2, { productLine: "xtrail-ice" });
  console.log("reply:", r2.reply.slice(0, 120));
  console.log("outOfScope?", r2.reply.includes("知識庫內容不符"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
