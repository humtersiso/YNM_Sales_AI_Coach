/**
 * 建立 roleplay_agent_dashboard（每業代一列首頁小結）
 * 用法：node scripts/ops/create-roleplay-agent-dashboard.cjs
 */
const { BigQuery } = require("@google-cloud/bigquery");
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && !process.env[t.slice(0, i).trim()]) {
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
}

loadEnv();

const projectId =
  process.env.BIGQUERY_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "gen-lang-client-0927009312";
const dataset = process.env.BIGQUERY_DATASET || "YNM_Sales_AI_Coach_test";
const table = process.env.ROLEPLAY_BQ_DASHBOARD_TABLE || "roleplay_agent_dashboard";

async function main() {
  const sqlPath = path.join(__dirname, "..", "..", "sql", "roleplay_agent_dashboard.sql");
  let sql = fs.readFileSync(sqlPath, "utf8");
  sql = sql.replace(/YOUR_PROJECT/g, projectId).replace(/YOUR_DATASET/g, dataset);
  const client = new BigQuery({ projectId });
  console.log(`Creating ${projectId}.${dataset}.${table} …`);
  await client.query({ query: sql, location: "asia-east1" });
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
