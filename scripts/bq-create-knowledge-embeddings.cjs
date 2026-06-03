/**
 * 建立 knowledge_unit_embeddings 表
 */
const { BigQuery } = require("@google-cloud/bigquery");
const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

const projectId =
  process.env.BIGQUERY_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0927009312";
const dataset = process.env.BIGQUERY_DATASET || "YNM_Sales_AI_Coach_test";
const table = process.env.BIGQUERY_TABLE_KNOWLEDGE_EMBEDDINGS || "knowledge_unit_embeddings";

async function run() {
  const client = new BigQuery({ projectId });
  const sql = `
    CREATE TABLE IF NOT EXISTS \`${projectId}.${dataset}.${table}\` (
      content_hash STRING NOT NULL,
      customer_question STRING NOT NULL,
      product_line STRING,
      material_category STRING,
      embedding ARRAY<FLOAT64> NOT NULL,
      embedded_at TIMESTAMP NOT NULL
    )
  `;
  await client.query({ query: sql });
  console.log(`OK: ${projectId}.${dataset}.${table}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
