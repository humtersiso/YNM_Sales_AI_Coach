const { BigQuery } = require("@google-cloud/bigquery");

const projectId = process.env.BIGQUERY_PROJECT_ID || "gen-lang-client-0927009312";
const username = process.argv[2] || "agent_tpe_01";
const datasets = ["YNM_Sales_AI_Coach_test", "YNM_Sales_AI_Coach_prod"];

async function run() {
  const bq = new BigQuery({ projectId });
  for (const ds of datasets) {
    const query = `
      SELECT username, status, user_id
      FROM \`${projectId}.${ds}.platform_users\`
      WHERE username = @username
    `;
    const [rows] = await bq.query({ query, params: { username }, location: "asia-east1" });
    console.log(ds, rows);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
