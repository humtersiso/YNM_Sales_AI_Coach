/**
 * 確認 roleplay_session_facts 表存在與欄位（含 report_json）
 * 用法：node scripts/ops/verify-roleplay-bq-table.cjs
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
  const full = `${projectId}.${dataset}.${table}`;

  const [meta] = await client.dataset(dataset).table(table).getMetadata();
  const fields = (meta.schema?.fields ?? []).map((f) => f.name);
  console.log(`OK 表存在：${full}`);
  console.log(`欄位數：${fields.length}`);
  console.log(`欄位：${fields.join(", ")}`);

  const need = [
    "session_id",
    "status",
    "score_empathy",
    "score_total",
    "transcript",
    "report_json",
  ];
  const missing = need.filter((n) => !fields.includes(n));
  if (missing.length) {
    console.error(`缺少欄位：${missing.join(", ")}`);
    if (missing.includes("report_json")) {
      console.error("請執行 sql/roleplay_session_facts_add_report_json.sql");
    }
    process.exit(1);
  }

  const [rows] = await client.query({
    query: `
      SELECT status, COUNT(*) AS cnt
      FROM \`${full}\`
      GROUP BY status
      ORDER BY status
    `,
    location: "asia-east1",
  });
  console.log("\n現有筆數（依 status）：");
  for (const r of rows) console.log(`  ${r.status}: ${r.cnt}`);

  const [recent] = await client.query({
    query: `
      SELECT session_id, status, agent_username, score_total, grade,
             completed_at IS NOT NULL AS has_completed,
             report_json IS NOT NULL AS has_report
      FROM \`${full}\`
      ORDER BY created_at DESC
      LIMIT 5
    `,
    location: "asia-east1",
  });
  console.log("\n最近 5 筆：");
  console.table(recent);
}

main().catch((e) => {
  console.error(e.message || e);
  if (/Not found/i.test(String(e.message))) {
    console.error(`表不存在，請執行：npm run bq:create:roleplay-facts`);
  }
  process.exit(1);
});
