/**
 * 驗證訓練素材匯入結果
 */
const { BigQuery } = require("@google-cloud/bigquery");
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();
const projectId = process.env.BIGQUERY_PROJECT_ID;
const dataset = process.env.BIGQUERY_DATASET;

async function run() {
  const client = new BigQuery({ projectId });
  const [meta] = await client.dataset(dataset).getMetadata();
  const loc = meta.location || "asia-east1";

  const queries = {
    assetsByStatus: `
      SELECT parse_status, material_category, COUNT(*) AS cnt
      FROM \`${projectId}.${dataset}.source_assets\`
      GROUP BY 1, 2 ORDER BY 1, 2`,
    unitsByCategory: `
      SELECT product_line, material_category, unit_type, COUNT(*) AS cnt
      FROM \`${projectId}.${dataset}.knowledge_units\`
      GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
    viewSample: `
      SELECT knowledge_source, product_line, material_category, COUNT(*) AS cnt
      FROM \`${projectId}.${dataset}.v_sales_knowledge\`
      GROUP BY 1, 2, 3 ORDER BY cnt DESC LIMIT 20`,
    competitorHits: `
      SELECT customer_question, LEFT(standard_script_idea, 80) AS script_preview
      FROM \`${projectId}.${dataset}.v_sales_knowledge\`
      WHERE material_category = 'competitor_compare'
      LIMIT 3`,
    assetFiles: `
      SELECT file_name, parse_status, material_category, parse_error
      FROM \`${projectId}.${dataset}.source_assets\`
      ORDER BY material_category, parse_status, file_name`,
    unitTotals: `
      SELECT COUNT(*) AS training_units FROM \`${projectId}.${dataset}.knowledge_units\``,
  };

  const report = {};
  for (const [key, sql] of Object.entries(queries)) {
    const [rows] = await client.query({ query: sql, location: loc });
    report[key] = rows;
  }
  console.log(JSON.stringify(report, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
