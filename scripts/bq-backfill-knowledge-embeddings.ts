/**
 * 批次為 v_sales_knowledge 的 customer_question 產生 embedding 並寫入 BQ
 * 用法：npx tsx scripts/bq-backfill-knowledge-embeddings.ts
 *       npx tsx scripts/bq-backfill-knowledge-embeddings.ts --limit=50
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { getBigQueryClient } from "../src/lib/bq/script-drills-insert";
import {
  getBigQueryDataset,
  getBigQueryProjectId,
  getSalesKnowledgeTableId,
} from "../src/lib/bq/knowledge-config";
import { embedText } from "../src/lib/gemini/knowledge-embedding";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const EMBEDDINGS_TABLE =
  (process.env.BIGQUERY_TABLE_KNOWLEDGE_EMBEDDINGS ?? "knowledge_unit_embeddings").trim();

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

function contentHash(question: string): string {
  return createHash("sha256").update(question.trim().toLowerCase()).digest("hex").slice(0, 32);
}

async function main() {
  loadEnv();

  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 200;

  const projectId = getBigQueryProjectId();
  const dataset = getBigQueryDataset();
  const viewTable = getSalesKnowledgeTableId();
  if (!projectId) {
    console.error("BIGQUERY_PROJECT_ID required");
    process.exit(1);
  }

  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: `
      SELECT DISTINCT customer_question, product_line, material_category
      FROM \`${projectId}.${dataset}.${viewTable}\`
      WHERE TRIM(COALESCE(customer_question, '')) != ''
      LIMIT ${limit}
    `,
  });

  let ok = 0;
  let skip = 0;

  for (const row of rows as Array<Record<string, string>>) {
    const q = row.customer_question?.trim() ?? "";
    if (!q) continue;
    const hash = contentHash(q);

    const [existing] = await client.query({
      query: `
        SELECT content_hash FROM \`${projectId}.${dataset}.${EMBEDDINGS_TABLE}\`
        WHERE content_hash = @hash LIMIT 1`,
      params: { hash },
    });
    if (existing.length) {
      skip += 1;
      continue;
    }

    const embedding = await embedText(q);
    if (!embedding?.length) {
      console.warn("embed failed:", q.slice(0, 40));
      continue;
    }

    await client.query({
      query: `
        INSERT INTO \`${projectId}.${dataset}.${EMBEDDINGS_TABLE}\`
        (content_hash, customer_question, product_line, material_category, embedding, embedded_at)
        VALUES (@hash, @q, @pl, @cat, @emb, CURRENT_TIMESTAMP())`,
      params: {
        hash,
        q,
        pl: row.product_line ?? null,
        cat: row.material_category ?? null,
        emb: embedding,
      },
    });
    ok += 1;
    if (ok % 10 === 0) console.log(`embedded ${ok}…`);
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`Done. inserted=${ok} skipped=${skip} total=${rows.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
