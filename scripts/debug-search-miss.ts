import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBigQueryClient } from "../src/lib/bq/script-drills-insert";
import {
  getBigQueryDataset,
  getBigQueryProjectId,
  getSalesKnowledgeTableId,
} from "../src/lib/bq/knowledge-config";
import { extractSearchKeywords, searchKnowledgeCitations } from "../src/lib/gemini/knowledge-search";
import { searchKnowledgeByPlan } from "../src/lib/gemini/knowledge-search-planned";
import { classifySalesQuestionByRules } from "../src/lib/gemini/sales-question-profile";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnv();
  const pid = getBigQueryProjectId();
  const ds = getBigQueryDataset();
  const tbl = getSalesKnowledgeTableId();
  const fqn = `\`${pid}.${ds}.${tbl}\``;
  const client = getBigQueryClient();

  const qs = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["我覺得XTRAIL後座椅子短不太好坐", "XTRAIL 特色如何?"];

  for (const q of qs) {
    console.log("\n===", q);
    const profile = classifySalesQuestionByRules(q);
    console.log("profile:", profile.category, profile.materialCategory);
    console.log("keywords:", extractSearchKeywords(q));

    const { plan } = await resolveSearchPlanWithProfile(q, {});
    console.log("plan scope:", plan.scope);

    const byPlan = await searchKnowledgeByPlan(q, plan, profile);
    console.log("searchByPlan:", byPlan.length);

    const noCat = await searchKnowledgeCitations(q, {
      productLine: plan.scope.productLine,
      materialCategory: null,
    });
    console.log("search no category:", noCat.length, noCat[0]?.question?.slice(0, 50));

    const [rows] = await client.query({
      query: `
        SELECT customer_question, material_category, product_line
        FROM ${fqn}
        WHERE LOWER(customer_question) LIKE LOWER(@q)
        LIMIT 5`,
      params: { q: `%${q.includes("後座") ? "後座椅子" : "特色"}%` },
    });
    console.log("BQ rows:", rows);
  }
}

main().catch(console.error);
