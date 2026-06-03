const { BigQuery } = require("@google-cloud/bigquery");

const projectId = process.env.BIGQUERY_PROJECT_ID || "gen-lang-client-0927009312";
const datasets = ["YNM_Sales_AI_Coach_test", "YNM_Sales_AI_Coach_prod"];

async function run() {
  const bq = new BigQuery({ projectId });
  for (const ds of datasets) {
    const query = `
      UPDATE \`${projectId}.${ds}.platform_users\`
      SET status='active', updated_at=CURRENT_TIMESTAMP()
      WHERE username='admin'
    `;
    await bq.query({ query, location: "asia-east1" });
    console.log(`Activated admin in ${ds}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
