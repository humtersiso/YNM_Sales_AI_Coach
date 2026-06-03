/**
 * 代表問句檢索驗收（查 v_sales_knowledge）
 */
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const QUESTIONS = [
  "XTRAIL 有什麼配備",
  "客戶擔心油耗",
  "跟競品比較",
  "試乘邀約話術",
  "價格優惠說明",
];

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

async function search(client, project, dataset, view, message, limit = 3) {
  const keywords = message
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5);
  if (keywords.length === 0) return [];

  const questionLikes = keywords.map((_, i) => `LOWER(customer_question) LIKE LOWER(@kw${i})`);
  const scriptLikes = keywords.map((_, i) => `LOWER(standard_script_idea) LIKE LOWER(@kw${i})`);
  const params = {};
  keywords.forEach((kw, i) => {
    params[`kw${i}`] = `%${kw}%`;
  });

  const sql = `
    SELECT customer_question, standard_script_idea, knowledge_source
    FROM \`${project}.${dataset}.${view}\`
    WHERE (${[...questionLikes, ...scriptLikes].join(" OR ")})
      AND TRIM(COALESCE(standard_script_idea, '')) != ''
    LIMIT ${limit}
  `;
  const [rows] = await client.query({ query: sql, params });
  return rows;
}

loadEnv();
const projectId = process.env.BIGQUERY_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const dataset = process.env.BIGQUERY_DATASET || "YNM_Sales_AI_Coach_test";
const view = process.env.BIGQUERY_TABLE_KNOWLEDGE || "v_sales_knowledge";

if (!projectId) {
  console.error("請設定 BIGQUERY_PROJECT_ID");
  process.exit(1);
}

const client = new BigQuery({ projectId });
const report = { validatedAt: new Date().toISOString(), view: `${projectId}.${dataset}.${view}`, results: [] };

for (const q of QUESTIONS) {
  const rows = await search(client, projectId, dataset, view, q);
  report.results.push({
    question: q,
    hitCount: rows.length,
    samples: rows.slice(0, 2).map((r) => ({
      source: r.knowledge_source,
      question: String(r.customer_question || "").slice(0, 80),
      script: String(r.standard_script_idea || "").slice(0, 120),
    })),
  });
}

console.log(JSON.stringify(report, null, 2));
