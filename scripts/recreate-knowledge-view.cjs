/**
 * 重建 v_sales_knowledge（僅 knowledge_units，不含 sales script）
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

const viewSql = (p, d) => `
CREATE OR REPLACE VIEW \`${p}.${d}.v_sales_knowledge\` AS
SELECT
  customer_question,
  title,
  standard_script AS standard_script_idea,
  'training' AS knowledge_source,
  product_line,
  material_category,
  unit_type,
  asset_id,
  source_locator
FROM \`${p}.${d}.knowledge_units\`
WHERE unit_type IN ('qa_pair', 'text_chunk', 'table_row')
  AND TRIM(COALESCE(standard_script, '')) != ''
  AND NOT (
    STARTS_WITH(TRIM(standard_script), 'PK')
    OR standard_script LIKE '%[Content_Types]%'
    OR standard_script LIKE '%xmlschemas%'
    OR standard_script LIKE '%_rels/.rels%'
  )
`;

async function run() {
  const client = new BigQuery({ projectId });
  const [meta] = await client.dataset(dataset).getMetadata();
  await client.query({ query: viewSql(projectId, dataset), location: meta.location || "asia-east1" });
  console.log(`View updated: ${projectId}.${dataset}.v_sales_knowledge (training only, no sales script)`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
