/**
 * 既有 dataset 新增 product_line 欄位並重建 view（不破壞既有列，新列需有值）
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

const projectId = process.env.BIGQUERY_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const dataset = process.env.BIGQUERY_DATASET || "YNM_Sales_AI_Coach_test";
const legacyTable = process.env.BIGQUERY_TABLE_SCRIPT_DRILLS || "sales script";

async function run() {
  const client = new BigQuery({ projectId });
  const [meta] = await client.dataset(dataset).getMetadata();
  const location = meta.location || "asia-east1";

  const alters = [
    `ALTER TABLE \`${projectId}.${dataset}.source_assets\`
       ADD COLUMN IF NOT EXISTS product_line STRING`,
    `ALTER TABLE \`${projectId}.${dataset}.knowledge_units\`
       ADD COLUMN IF NOT EXISTS product_line STRING`,
    `UPDATE \`${projectId}.${dataset}.source_assets\`
       SET product_line = COALESCE(product_line, '_legacy')
       WHERE product_line IS NULL`,
    `UPDATE \`${projectId}.${dataset}.knowledge_units\`
       SET product_line = COALESCE(product_line, '_legacy')
       WHERE product_line IS NULL`,
  ];

  for (const q of alters) {
    await client.query({ query: q, location });
  }

  await client.query({
    query: `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_sales_knowledge\` AS
      SELECT customer_question, standard_script AS standard_script_idea, 'training' AS knowledge_source,
        product_line, material_category, unit_type, asset_id, source_locator
      FROM \`${projectId}.${dataset}.knowledge_units\`
      WHERE unit_type IN ('qa_pair', 'text_chunk', 'table_row')
        AND TRIM(COALESCE(standard_script, '')) != ''`,
    location,
  });

  console.log(`Migrated ${projectId}.${dataset}: product_line + v_sales_knowledge`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
