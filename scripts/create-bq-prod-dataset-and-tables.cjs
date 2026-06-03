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

async function ensureDataset(client, datasetId) {
  const dataset = client.dataset(datasetId);
  const [exists] = await dataset.exists();
  const [sourceMeta] = await client.dataset(sourceDataset).getMetadata();
  const sourceLocation = sourceMeta.location || "asia-east1";
  if (!exists) {
    await dataset.create({ location: sourceLocation });
    console.log(`Created dataset: ${projectId}.${datasetId}`);
  } else {
    const [meta] = await dataset.getMetadata();
    if (meta.location !== sourceLocation) {
      throw new Error(
        `Dataset ${datasetId} location=${meta.location} 與來源 ${sourceDataset} location=${sourceLocation} 不一致`,
      );
    }
    console.log(`Dataset exists: ${projectId}.${datasetId} (${meta.location})`);
  }
  return sourceLocation;
}

async function run() {
  const client = new BigQuery({ projectId });
  const sourceLocation = await ensureDataset(client, targetDataset);

  const queries = [
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${targetDataset}.platform_users\` (
      user_id STRING NOT NULL,
      username STRING NOT NULL,
      password_hash STRING NOT NULL,
      role STRING NOT NULL,
      display_name STRING NOT NULL,
      branch STRING NOT NULL,
      tenure_years INT64 NOT NULL,
      status STRING NOT NULL,
      must_change_password BOOL NOT NULL,
      last_login_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      created_by STRING
    )`,
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${targetDataset}.usage_events\` (
      event_id STRING NOT NULL,
      user_id STRING NOT NULL,
      username STRING NOT NULL,
      branch STRING NOT NULL,
      tenure_years INT64 NOT NULL,
      assistant_type STRING NOT NULL,
      question_kind STRING NOT NULL,
      question STRING NOT NULL,
      reply_summary STRING,
      in_question_bank BOOL,
      asked_at TIMESTAMP NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${targetDataset}.auth_audit_log\` (
      audit_id STRING NOT NULL,
      action STRING NOT NULL,
      actor_username STRING NOT NULL,
      target_username STRING,
      ip_address STRING,
      detail STRING,
      created_at TIMESTAMP NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${targetDataset}.${scriptTable}\` AS
       SELECT * FROM \`${projectId}.${sourceDataset}.${scriptTable}\`
       WHERE 1 = 0`,
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${targetDataset}.expert list\` AS
       SELECT * FROM \`${projectId}.${sourceDataset}.expert list\`
       WHERE 1 = 0`,
    `ALTER TABLE \`${projectId}.${targetDataset}.platform_users\`
       ADD COLUMN IF NOT EXISTS must_change_password BOOL`,
  ];

  for (const query of queries) {
    await client.query({ query, location: sourceLocation });
  }
  const knowledgeQueries = [
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${targetDataset}.source_assets\` (
      asset_id STRING NOT NULL,
      ingest_batch_id STRING NOT NULL,
      source_system STRING NOT NULL,
      product_line STRING NOT NULL,
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
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${targetDataset}.knowledge_units\` (
      unit_id STRING NOT NULL,
      ingest_batch_id STRING NOT NULL,
      asset_id STRING NOT NULL,
      product_line STRING NOT NULL,
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
    `CREATE OR REPLACE VIEW \`${projectId}.${targetDataset}.v_sales_knowledge\` AS
      SELECT customer_question, standard_script AS standard_script_idea, 'training' AS knowledge_source,
        product_line, material_category, unit_type, asset_id, source_locator
      FROM \`${projectId}.${targetDataset}.knowledge_units\`
      WHERE unit_type IN ('qa_pair', 'text_chunk', 'table_row')
        AND TRIM(COALESCE(standard_script, '')) != ''`,
  ];
  for (const query of knowledgeQueries) {
    await client.query({ query, location: sourceLocation });
  }

  console.log(
    `Ready: ${projectId}.${targetDataset} (tables: ${scriptTable}, expert list, platform_users, usage_events, auth_audit_log, source_assets, knowledge_units, v_sales_knowledge)`,
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
