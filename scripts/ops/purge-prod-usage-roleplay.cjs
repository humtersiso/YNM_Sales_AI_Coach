/**
 * 清空 prod BQ 銷售/對練使用紀錄（usage_events、roleplay_session_facts、roleplay_agent_dashboard）
 * 用法：node scripts/ops/purge-prod-usage-roleplay.cjs
 */
const { BigQuery } = require("@google-cloud/bigquery");

const projectId =
  process.env.BIGQUERY_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "gen-lang-client-0927009312";
const dataset = process.env.BIGQUERY_DATASET || "YNM_Sales_AI_Coach_prod";
const location = "asia-east1";
const tables = ["usage_events", "roleplay_session_facts", "roleplay_agent_dashboard"];

async function countRows(bq, table) {
  const [rows] = await bq.query({
    query: `SELECT COUNT(*) AS n FROM \`${projectId}.${dataset}.${table}\``,
    location,
  });
  return Number(rows[0].n);
}

async function main() {
  const bq = new BigQuery({ projectId });
  console.log(`Dataset: ${projectId}.${dataset}\n`);

  console.log("=== 刪除前筆數 ===");
  for (const t of tables) {
    console.log(`${t}: ${await countRows(bq, t)}`);
  }

  console.log("\n=== 執行 DELETE ===");
  for (const t of tables) {
    await bq.query({
      query: `DELETE FROM \`${projectId}.${dataset}.${t}\` WHERE TRUE`,
      location,
    });
    console.log(`deleted ${t}`);
  }

  console.log("\n=== 刪除後筆數 ===");
  for (const t of tables) {
    console.log(`${t}: ${await countRows(bq, t)}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
