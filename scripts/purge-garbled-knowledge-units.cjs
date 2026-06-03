/**
 * 刪除 knowledge_units 中疑似亂碼列（xlsx 當 utf8 等），並列出受影響 asset_id
 * 用法：node scripts/purge-garbled-knowledge-units.cjs [--dry-run]
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
const dryRun = process.argv.includes("--dry-run");
const projectId = process.env.BIGQUERY_PROJECT_ID;
const dataset = process.env.BIGQUERY_DATASET;
if (!projectId || !dataset) {
  console.error("請設定 BIGQUERY_PROJECT_ID、BIGQUERY_DATASET");
  process.exit(1);
}

const table = `\`${projectId}.${dataset}.knowledge_units\``;

const selectSql = `
  SELECT unit_id, asset_id, file_name_hint, material_category, unit_type,
    SUBSTR(standard_script, 1, 80) AS script_preview
  FROM (
    SELECT ku.unit_id, ku.asset_id, ku.material_category, ku.unit_type, ku.standard_script,
      sa.file_name AS file_name_hint
    FROM ${table} ku
    LEFT JOIN \`${projectId}.${dataset}.source_assets\` sa
      ON ku.asset_id = sa.asset_id
  )
  WHERE
    STARTS_WITH(standard_script, 'PK')
    OR standard_script LIKE '%[Content_Types]%'
    OR standard_script LIKE '%xmlschemas%'
    OR standard_script LIKE '%_rels/.rels%'
`;

async function main() {
  const client = new BigQuery({ projectId });
  const [rows] = await client.query({ query: selectSql });
  const unitIds = rows.map((r) => r.unit_id);
  const assetIds = [...new Set(rows.map((r) => r.asset_id).filter(Boolean))];

  console.log(
    JSON.stringify(
      {
        dryRun,
        matchCount: rows.length,
        assetIds,
        samples: rows.slice(0, 10),
      },
      null,
      2,
    ),
  );

  if (dryRun || unitIds.length === 0) return;

  const deleteSql = `
    DELETE FROM ${table}
    WHERE unit_id IN UNNEST(@unit_ids)
  `;
  await client.query({
    query: deleteSql,
    params: { unit_ids: unitIds },
  });
  console.log(JSON.stringify({ deleted: unitIds.length }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
