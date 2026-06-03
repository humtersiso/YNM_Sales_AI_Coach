const { BigQuery } = require("@google-cloud/bigquery");

const projectId = process.env.BIGQUERY_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "gen-lang-client-0927009312";
const oldDataset = process.env.OLD_DATASET || "YNM_Sales_AI_Coach";
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
const backupDataset = process.env.BACKUP_DATASET || `${oldDataset}_backup_${stamp}`;

async function run() {
  const bq = new BigQuery({ projectId });
  const source = bq.dataset(oldDataset);
  const [sourceExists] = await source.exists();
  if (!sourceExists) {
    throw new Error(`Source dataset not found: ${projectId}.${oldDataset}`);
  }

  const [sourceMeta] = await source.getMetadata();
  const location = sourceMeta.location || "asia-east1";
  const backup = bq.dataset(backupDataset);
  const [backupExists] = await backup.exists();
  if (backupExists) {
    throw new Error(`Backup dataset already exists: ${projectId}.${backupDataset}`);
  }
  await backup.create({ location });
  console.log(`Backup dataset created: ${projectId}.${backupDataset} (${location})`);

  const [tables] = await source.getTables();
  for (const t of tables) {
    const tableId = t.id;
    const query = `
      CREATE OR REPLACE TABLE \`${projectId}.${backupDataset}.${tableId}\` AS
      SELECT * FROM \`${projectId}.${oldDataset}.${tableId}\`
    `;
    await bq.query({ query, location });
    console.log(`Backed up table: ${tableId}`);
  }

  await source.delete({ force: true });
  console.log(`Deleted dataset: ${projectId}.${oldDataset}`);
  console.log(`Backup ready: ${projectId}.${backupDataset}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
