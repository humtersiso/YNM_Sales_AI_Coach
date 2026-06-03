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
const scriptTable = process.env.BIGQUERY_TABLE_SCRIPT_DRILLS || "sales script";

async function run() {
  const client = new BigQuery({ projectId });
  const [sourceMeta] = await client.dataset(sourceDataset).getMetadata();
  const location = sourceMeta.location || "asia-east1";
  const [targetMeta] = await client.dataset(targetDataset).getMetadata();
  if (targetMeta.location !== location) {
    throw new Error(
      `Target dataset location=${targetMeta.location} 與 source=${location} 不一致，請先修正`,
    );
  }

  const tables = [scriptTable, "expert list", "platform_users", "usage_events", "auth_audit_log"];
  for (const tableName of tables) {
    const query = `
      CREATE OR REPLACE TABLE \`${projectId}.${targetDataset}.${tableName}\` AS
      SELECT * FROM \`${projectId}.${sourceDataset}.${tableName}\`
    `;
    await client.query({ query, location });
    console.log(`Migrated: ${tableName}`);
  }
  console.log(`Done: ${projectId}.${sourceDataset} -> ${projectId}.${targetDataset}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
