/**
 * 將 agent_username=admin 但 agent_id 為占位值的紀錄改為 BQ 真實 admin userId
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

const projectId = process.env.BIGQUERY_PROJECT_ID || "gen-lang-client-0927009312";
const dataset = process.env.BIGQUERY_DATASET || "YNM_Sales_AI_Coach_test";
const table = process.env.ROLEPLAY_BQ_TABLE || "roleplay_session_facts";
const placeholder = process.argv[2] || "admin-seed-user";
const realId = process.argv[3];

async function main() {
  if (!realId) {
    console.error("用法：node fix-admin-roleplay-agent-id.cjs [placeholderId] [realAdminUserId]");
    process.exit(1);
  }
  const full = `\`${projectId}.${dataset}.${table}\``;
  const client = new BigQuery({ projectId });
  const [rows] = await client.query({
    query: `SELECT COUNT(*) AS cnt FROM ${full} WHERE agent_id = @placeholder`,
    params: { placeholder },
    location: "asia-east1",
  });
  const cnt = Number(rows[0]?.cnt ?? 0);
  if (!cnt) {
    console.log("無需修正的列");
    return;
  }
  await client.query({
    query: `UPDATE ${full} SET agent_id = @realId WHERE agent_id = @placeholder`,
    params: { realId, placeholder },
    location: "asia-east1",
  });
  console.log(`已將 ${cnt} 筆 agent_id：${placeholder} → ${realId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
