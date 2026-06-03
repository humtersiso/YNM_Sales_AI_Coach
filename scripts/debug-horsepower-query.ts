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

import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import { searchKnowledgeHitsByPlan } from "../src/lib/gemini/knowledge-search-planned";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";

const questions = [
  "XTRAIL 跟 RAV4 油耗怎麼比",
  "X-TRAIL ICE 的馬力如何？",
];

async function main() {
  for (const q of questions) {
    console.log("\n========", q, "========");
    const { plan, profile } = await resolveSearchPlanWithProfile(q, {});
    const hits = await searchKnowledgeHitsByPlan(q, plan, profile);
    console.log("top hits:", hits.length);
    for (const h of hits.slice(0, 5)) {
      const has204 = /204|馬力|ps|扭力|VC-TURBO/i.test(
        `${h.customer_question} ${h.standard_script ?? ""}`,
      );
      console.log(`score=${h.rerankScore?.toFixed(1)} 204相关=${has204}`);
      console.log(" Q:", (h.customer_question ?? "").slice(0, 70));
      console.log(" S:", (h.standard_script ?? "").slice(0, 120).replace(/\n/g, " "));
    }
    const r = await chatWithDataAgent(q);
    console.log("answer has 204:", /204\s*ps|204ps/i.test(r.reply + r.bullets.join(" ")));
    console.log("intro:", r.reply.slice(0, 100));
  }
}

void main();
