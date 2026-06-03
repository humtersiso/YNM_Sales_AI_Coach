/**
 * 將 text_chunk / table_row 的 customer_question 改為「檔名線索 + 內文摘要」。
 * 用法：npx tsx scripts/bq-backfill-chunk-search-text.ts
 *       npx tsx scripts/bq-backfill-chunk-search-text.ts --dry-run --limit=20
 *       npx tsx scripts/bq-backfill-chunk-search-text.ts --only=table_row
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBigQueryClient } from "../src/lib/bq/script-drills-insert";
import { getBigQueryDataset, getBigQueryProjectId } from "../src/lib/bq/knowledge-config";
import {
  isFileLocatorOnlyCustomerQuestion,
  rebuildChunkCustomerQuestion,
  rebuildTableRowSearchFields,
} from "../src/lib/ingest/chunk-search-text";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(webRoot, ".env");
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

type Row = {
  unit_id: string;
  unit_type: string;
  customer_question: string;
  title: string | null;
  standard_script: string;
  file_name: string | null;
};

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const onlyType = onlyArg?.split("=")[1]?.trim() ?? "";
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 5000;
  const unitFilter =
    onlyType === "table_row"
      ? "ku.unit_type = 'table_row'"
      : onlyType === "text_chunk"
        ? "ku.unit_type = 'text_chunk'"
        : "ku.unit_type IN ('text_chunk', 'table_row')";

  const projectId = getBigQueryProjectId();
  const dataset = getBigQueryDataset();
  if (!projectId) {
    console.error("BIGQUERY_PROJECT_ID required");
    process.exit(1);
  }

  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: `
      SELECT
        ku.unit_id,
        ku.unit_type,
        ku.customer_question,
        ku.title,
        ku.standard_script,
        sa.file_name
      FROM \`${projectId}.${dataset}.knowledge_units\` ku
      LEFT JOIN \`${projectId}.${dataset}.source_assets\` sa ON ku.asset_id = sa.asset_id
      WHERE ${unitFilter}
        AND TRIM(COALESCE(ku.standard_script, '')) != ''
      LIMIT ${limit}
    `,
  });

  let updated = 0;
  let skipped = 0;

  for (const row of rows as Row[]) {
    const cq = row.customer_question?.trim() ?? "";
    let rebuilt: { title: string; customer_question: string } | null = null;

    if (row.unit_type === "table_row") {
      rebuilt = rebuildTableRowSearchFields({
        fileName: row.file_name,
        title: row.title,
        standard_script: row.standard_script,
      });
    } else {
      const needs =
        isFileLocatorOnlyCustomerQuestion(cq) ||
        (!cq.includes(" · ") && /\.(pdf|pptx|ppt)\s*\(/i.test(cq));

      if (!needs && cq.includes(" · ")) {
        skipped += 1;
        continue;
      }

      rebuilt = rebuildChunkCustomerQuestion({
        fileName: row.file_name,
        title: row.title,
        customer_question: row.customer_question,
        standard_script: row.standard_script,
      });
    }
    if (!rebuilt) {
      skipped += 1;
      continue;
    }

    if (
      rebuilt.customer_question === cq &&
      (row.title?.trim() || "") === rebuilt.title
    ) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log("would update", row.unit_id.slice(0, 8), rebuilt.title.slice(0, 50));
      console.log("  cq:", rebuilt.customer_question.slice(0, 90));
      updated += 1;
      continue;
    }

    await client.query({
      query: `
        UPDATE \`${projectId}.${dataset}.knowledge_units\`
        SET title = @title, customer_question = @cq
        WHERE unit_id = @id`,
      params: {
        id: row.unit_id,
        title: rebuilt.title,
        cq: rebuilt.customer_question,
      },
    });
    updated += 1;
    if (updated % 50 === 0) console.log("updated", updated);
  }

  console.log({ dryRun, scanned: (rows as Row[]).length, updated, skipped });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
