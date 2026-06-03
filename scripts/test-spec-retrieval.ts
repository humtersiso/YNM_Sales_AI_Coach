/**
 * 規格類問句檢索 smoke（需 BQ + .env）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchKnowledgeHitsByPlan } from "../src/lib/gemini/knowledge-search-planned";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  if (!process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const cases = [
  { q: "X-TRAIL ICE 的馬力如何？", must: /204\s*ps|204ps/i },
  { q: "X-TRAIL 最大扭力多少", must: /30\.?6|kgm/i },
  { q: "XTRAIL 跟 RAV4 油耗怎麼比", must: /km\/L|km\/l|油耗/i },
];

async function main() {
  let failed = 0;
  for (const { q, must } of cases) {
    const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
    const hits = await searchKnowledgeHitsByPlan(q, plan, profile);
    const top5 = hits.slice(0, 5);
    const blob = top5.map((h) => `${h.customer_question}\n${h.standard_script}`).join("\n");
    const ok = must.test(blob);
    console.log(ok ? "PASS" : "FAIL", q, "top:", hits[0]?.customer_question?.slice(0, 60));
    if (!ok) {
      failed += 1;
      for (const h of top5.slice(0, 3)) {
        console.log("  -", h.rerankScore?.toFixed(1), h.customer_question?.slice(0, 70));
      }
    }
  }
  if (failed) process.exit(1);
  console.log("\nSpec retrieval smoke passed.");
}

void main();
