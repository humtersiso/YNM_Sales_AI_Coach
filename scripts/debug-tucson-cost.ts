import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  if (!process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

import { getBigQueryClient } from "../src/lib/bq/script-drills-insert";
import { getBigQueryDataset, getBigQueryProjectId } from "../src/lib/bq/knowledge-config";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import { searchKnowledgeHitsByPlan } from "../src/lib/gemini/knowledge-search-planned";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";

async function main() {
  const p = getBigQueryProjectId()!;
  const d = getBigQueryDataset();
  const client = getBigQueryClient();

  const [rows] = await client.query({
    query: `
      SELECT customer_question, title, SUBSTR(standard_script, 1, 400) AS script,
        material_category, source_locator
      FROM \`${p}.${d}.knowledge_units\`
      WHERE LOWER(standard_script) LIKE '%tucson%'
        AND (LOWER(standard_script) LIKE '%持有成本%'
          OR LOWER(standard_script) LIKE '%用車成本%'
          OR LOWER(standard_script) LIKE '%10萬%'
          OR LOWER(standard_script) LIKE '%萬元%')
      LIMIT 12
    `,
  });
  console.log("BQ rows with tucson+cost:", (rows as unknown[]).length);
  for (const r of rows as Record<string, string>[]) {
    const hasMoney = /[\d,]+萬|[\d,]+元|\d+\.\d+萬/.test(r.script ?? "");
    console.log("\n---", hasMoney ? "[有金額]" : "[無明顯金額]", (r.title || r.customer_question)?.slice(0, 55));
    console.log(r.script?.replace(/\s+/g, " ").slice(0, 200));
  }

  const qs = [
    "TUCSON L 長期持有成本",
    "TUCSON L 長期持有成本詳細數字是？",
    "TUCSON 長期持有成本",
  ];

  for (const q of qs) {
    console.log("\n======== CHAT:", q);
    const { plan, profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
    const hits = await searchKnowledgeHitsByPlan(q, plan, profile);
    console.log("hits", hits.length);
    for (const h of hits.slice(0, 3)) {
      const s = (h.standard_script ?? "").slice(0, 250);
      console.log(" -", h.customer_question?.slice(0, 50));
      console.log("  money?", /萬|元|,\d{3}/.test(s));
      console.log("  ", s.replace(/\s+/g, " ").slice(0, 120));
    }
    const r = await chatWithDataAgent(q, { productLine: "xtrail-ice" });
    const blob = r.reply + r.bullets.join(" ");
    console.log("reply has 萬/元:", /萬|元/.test(blob));
    console.log("intro:", r.reply.slice(0, 150));
  }
}

void main();
