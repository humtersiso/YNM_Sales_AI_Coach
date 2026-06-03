/**
 * 新增 material_category 欄位並重建 v_sales_knowledge
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
async function run() {
  const client = new BigQuery({ projectId });
  const [meta] = await client.dataset(dataset).getMetadata();
  const location = meta.location || "asia-east1";

  for (const q of [
    `ALTER TABLE \`${projectId}.${dataset}.source_assets\`
       ADD COLUMN IF NOT EXISTS material_category STRING`,
    `ALTER TABLE \`${projectId}.${dataset}.knowledge_units\`
       ADD COLUMN IF NOT EXISTS material_category STRING`,
    `UPDATE \`${projectId}.${dataset}.source_assets\`
       SET material_category = COALESCE(material_category, 'general')
       WHERE material_category IS NULL`,
    `UPDATE \`${projectId}.${dataset}.knowledge_units\`
       SET material_category = COALESCE(material_category, 'general')
       WHERE material_category IS NULL`,
  ]) {
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

  console.log(`Migrated ${projectId}.${dataset}: material_category`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
