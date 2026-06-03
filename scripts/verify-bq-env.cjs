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

const projectId = process.env.BIGQUERY_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0927009312";
const sourceDataset = process.env.BQ_SOURCE_DATASET || "YNM_Sales_AI_Coach_test";
const targetDataset = process.env.BQ_TARGET_DATASET || "YNM_Sales_AI_Coach_prod";
const activeDataset = process.env.BIGQUERY_DATASET || sourceDataset;
const scriptTable = process.env.BIGQUERY_TABLE_SCRIPT_DRILLS || "sales script";
const tables = [scriptTable, "expert list", "platform_users", "usage_events", "auth_audit_log"];

async function countRows(client, dataset, table, location) {
  const query = `SELECT COUNT(*) AS n FROM \`${projectId}.${dataset}.${table}\``;
  const [rows] = await client.query({ query, location });
  return Number(rows[0]?.n ?? 0);
}

async function datasetInfo(client, dataset) {
  const [meta] = await client.dataset(dataset).getMetadata();
  return {
    dataset,
    location: meta.location,
  };
}

async function run() {
  const client = new BigQuery({ projectId });
  const src = await datasetInfo(client, sourceDataset);
  const tgt = await datasetInfo(client, targetDataset);

  console.log("Project:", projectId);
  console.log("Active BIGQUERY_DATASET:", activeDataset);
  console.log("Source dataset:", `${src.dataset} (${src.location})`);
  console.log("Target dataset:", `${tgt.dataset} (${tgt.location})`);
  console.log("--- Row counts ---");

  for (const table of tables) {
    const srcCount = await countRows(client, sourceDataset, table, src.location);
    const tgtCount = await countRows(client, targetDataset, table, tgt.location);
    const mark = srcCount === tgtCount ? "OK" : "DIFF";
    console.log(`${table}: source=${srcCount}, target=${tgtCount} [${mark}]`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
