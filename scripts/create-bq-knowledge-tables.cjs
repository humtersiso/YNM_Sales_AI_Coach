/**
 * 建立 source_assets、knowledge_units、v_sales_knowledge（test/prod dataset）
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
const dataset = process.env.BIGQUERY_DATASET || "YNM_Sales_AI_Coach_test";
/** 舊話術表已停用；view 僅讀 knowledge_units */

async function ensureDataset(client, datasetId) {
  const ds = client.dataset(datasetId);
  const [exists] = await ds.exists();
  const location = process.env.BQ_LOCATION || "asia-east1";
  if (!exists) {
    await ds.create({ location });
    console.log(`Created dataset: ${projectId}.${datasetId}`);
  }
  const [meta] = await ds.getMetadata();
  return meta.location || location;
}

async function run() {
  const client = new BigQuery({ projectId });
  const location = await ensureDataset(client, dataset);

  const queries = [
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${dataset}.source_assets\` (
      asset_id STRING NOT NULL,
      ingest_batch_id STRING NOT NULL,
      source_system STRING NOT NULL,
      product_line STRING NOT NULL,
      material_category STRING NOT NULL,
      relative_path STRING NOT NULL,
      file_name STRING NOT NULL,
      mime_type STRING,
      file_size INT64 NOT NULL,
      content_hash STRING NOT NULL,
      gcs_uri STRING,
      parse_status STRING NOT NULL,
      parse_error STRING,
      ingested_at TIMESTAMP NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${dataset}.knowledge_units\` (
      unit_id STRING NOT NULL,
      ingest_batch_id STRING NOT NULL,
      asset_id STRING NOT NULL,
      product_line STRING NOT NULL,
      material_category STRING NOT NULL,
      unit_type STRING NOT NULL,
      title STRING,
      customer_question STRING,
      standard_script STRING,
      source_locator STRING,
      tags ARRAY<STRING>,
      language STRING NOT NULL,
      content_hash STRING NOT NULL,
      ingested_at TIMESTAMP NOT NULL
    )`,
    `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.v_sales_knowledge\` AS
      SELECT customer_question, standard_script AS standard_script_idea, 'training' AS knowledge_source,
        product_line, material_category, unit_type, asset_id, source_locator
      FROM \`${projectId}.${dataset}.knowledge_units\`
      WHERE unit_type IN ('qa_pair', 'text_chunk', 'table_row')
        AND TRIM(COALESCE(standard_script, '')) != ''`,
  ];

  for (const query of queries) {
    await client.query({ query, location });
  }

  console.log(
    `Ready: ${projectId}.${dataset} (source_assets, knowledge_units, v_sales_knowledge [training only])`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
