const { BigQuery } = require("@google-cloud/bigquery");

const projectId = process.env.BIGQUERY_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0927009312";
const oldDataset = process.env.OLD_TEST_DATASET || "YNM_Sales_AI_Coach";
const newDataset = process.env.NEW_TEST_DATASET || "YNM_Sales_AI_Coach_test";
const scriptTable = process.env.BIGQUERY_TABLE_SCRIPT_DRILLS || "sales script";
const tables = [scriptTable, "expert list", "platform_users", "usage_events", "auth_audit_log"];

async function ensureDataset(client, datasetId, location) {
  const ds = client.dataset(datasetId);
  const [exists] = await ds.exists();
  if (!exists) {
    await ds.create({ location });
    console.log(`Created dataset: ${projectId}.${datasetId} (${location})`);
  } else {
    const [meta] = await ds.getMetadata();
    console.log(`Dataset exists: ${projectId}.${datasetId} (${meta.location})`);
  }
}

async function run() {
  const client = new BigQuery({ projectId });
  const [oldMeta] = await client.dataset(oldDataset).getMetadata();
  const location = oldMeta.location || "asia-east1";
  await ensureDataset(client, newDataset, location);

  for (const table of tables) {
    const query = `
      CREATE OR REPLACE TABLE \`${projectId}.${newDataset}.${table}\` AS
      SELECT * FROM \`${projectId}.${oldDataset}.${table}\`
    `;
    await client.query({ query, location });
    console.log(`Copied: ${table}`);
  }

  console.log(`Done: ${projectId}.${oldDataset} -> ${projectId}.${newDataset}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
