/**
 * 將 test dataset 的 source_assets、knowledge_units 複製到 prod（全量覆寫目標表）
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

const projectId = process.env.BIGQUERY_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0927009312";
const sourceDataset = process.env.BQ_SOURCE_DATASET || "YNM_Sales_AI_Coach_test";
const targetDataset = process.env.BQ_TARGET_DATASET || "YNM_Sales_AI_Coach_prod";
const tables = ["source_assets", "knowledge_units"];

async function run() {
  const client = new BigQuery({ projectId });
  const [meta] = await client.dataset(sourceDataset).getMetadata();
  const location = meta.location || "asia-east1";

  for (const table of tables) {
    await client.query({
      query: `CREATE OR REPLACE TABLE \`${projectId}.${targetDataset}.${table}\` AS
        SELECT * FROM \`${projectId}.${sourceDataset}.${table}\``,
      location,
    });
    console.log(`Copied ${sourceDataset}.${table} -> ${targetDataset}.${table}`);
  }

  await client.query({
    query: `CREATE OR REPLACE VIEW \`${projectId}.${targetDataset}.v_sales_knowledge\` AS
      SELECT customer_question, standard_script AS standard_script_idea, 'training' AS knowledge_source,
        product_line, material_category, unit_type, asset_id, source_locator
      FROM \`${projectId}.${targetDataset}.knowledge_units\`
      WHERE unit_type IN ('qa_pair', 'text_chunk', 'table_row')
        AND TRIM(COALESCE(standard_script, '')) != ''`,
    location,
  });
  console.log(`Refreshed view ${targetDataset}.v_sales_knowledge`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
