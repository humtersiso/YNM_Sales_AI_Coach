/**
 * 為 roleplay_session_facts 新增 report_json 欄位
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
const table = process.env.ROLEPLAY_BQ_TABLE || "roleplay_session_facts";

async function main() {
  const client = new BigQuery({ projectId });
  const sql = `ALTER TABLE \`${projectId}.${dataset}.${table}\` ADD COLUMN IF NOT EXISTS report_json STRING`;
  console.log("執行：", sql);
  await client.query({ query: sql, location: "asia-east1" });
  console.log("完成：report_json 已就緒");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
