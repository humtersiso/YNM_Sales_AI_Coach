import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  const v = m[2].trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

import { detectUnknownKnowledgeSubjects, assessSalesQueryAnswerability } from "../src/lib/gemini/query-relevance-guard";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import { searchKnowledgeByPlan } from "../src/lib/gemini/knowledge-search-planned";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { prepareDisplayCitations } from "../src/lib/gemini/citation-utils";

const qs = ["馬力", "馬力如何", "X-TRAIL ICE 的馬力如何？", "XTRAIL 馬力多少"];

async function main() {
  for (const q of qs) {
    console.log("\n===", q, "===");
    console.log("unknown:", detectUnknownKnowledgeSubjects(q));
    const pre = assessSalesQueryAnswerability(q, []);
    console.log("preCheck:", pre);

    const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
    console.log("profile:", profile.category, profile.materialCategory);

    const cites = await searchKnowledgeByPlan(q, plan, profile);
    console.log("hits:", cites.length);
    if (cites[0]) {
      console.log(" topQ:", cites[0].question?.slice(0, 70));
      console.log(" script has 204:", /204\s*ps/i.test(cites[0].script ?? ""));
    }

    const display = prepareDisplayCitations(cites);
    const post = assessSalesQueryAnswerability(q, display, { questionCategory: profile.category });
    console.log("postCheck:", post);

    const r = await chatWithDataAgent(q, { productLine: "xtrail-ice" });
    const blocked = r.reply.includes("與目前話術知識庫內容不符");
    console.log("chat blocked:", blocked);
    console.log("reply:", r.reply.slice(0, 120));
    console.log("citations:", r.citations.length);
  }
}

void main();
