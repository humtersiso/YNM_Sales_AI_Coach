const { BigQuery } = require("@google-cloud/bigquery");

const projectId = process.env.BIGQUERY_PROJECT_ID || "gen-lang-client-0927009312";
const dataset = process.env.BIGQUERY_DATASET || "YNM_Sales_AI_Coach_test";

async function run() {
  const bq = new BigQuery({ projectId });
  const queries = [
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${dataset}.platform_users\` (
      user_id STRING NOT NULL,
      username STRING NOT NULL,
      password_hash STRING NOT NULL,
      role STRING NOT NULL,
      display_name STRING NOT NULL,
      branch STRING NOT NULL,
      tenure_years INT64 NOT NULL,
      status STRING NOT NULL,
      last_login_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL,
      updated_at TIMESTAMP NOT NULL,
      created_by STRING
    )`,
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${dataset}.usage_events\` (
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
    `CREATE TABLE IF NOT EXISTS \`${projectId}.${dataset}.auth_audit_log\` (
      audit_id STRING NOT NULL,
      action STRING NOT NULL,
      actor_username STRING NOT NULL,
      target_username STRING,
      ip_address STRING,
      detail STRING,
      created_at TIMESTAMP NOT NULL
    )`,
    `ALTER TABLE \`${projectId}.${dataset}.platform_users\`
       ADD COLUMN IF NOT EXISTS must_change_password BOOL`,
  ];

  for (const query of queries) {
    await bq.query({ query });
    console.log("OK:", query.match(/`([^`]+)`/)[1]);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
