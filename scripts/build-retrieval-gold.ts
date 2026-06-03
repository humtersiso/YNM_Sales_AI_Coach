/**
 * 從 BQ 匯出題庫並產生 paraphrase 變體，寫入 data/retrieval-gold.json
 * 用法：npx tsx scripts/build-retrieval-gold.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBigQueryClient } from "../src/lib/bq/script-drills-insert";
import {
  getBigQueryDataset,
  getBigQueryProjectId,
  getSalesKnowledgeTableId,
} from "../src/lib/bq/knowledge-config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

export type RetrievalGoldCase = {
  id: string;
  query: string;
  expectQuestionContains: string;
  expectSourceLocator?: string;
  productLine?: string;
  materialCategory?: string;
};

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

function paraphraseQuestion(q: string): string[] {
  const out = new Set<string>();
  const base = q.trim();
  if (!base) return [];

  out.add(base.replace(/[?？吗嗎呢]+$/u, "").trim());
  out.add(base.replace(/X-TRAIL/gi, "XTRAIL"));
  out.add(base.replace(/XTRAIL/gi, "X-TRAIL"));

  const stripped = base
    .replace(/^(我覺得|客戶說|客戶問|請問)/u, "")
    .replace(/(如何|怎麼样|怎么样|怎样|嗎|吗|呢|\?|？)$/u, "")
    .trim();
  if (stripped.length >= 4) out.add(stripped);

  return [...out].filter((s) => s.length >= 3 && s !== base);
}

function coreTerm(question: string): string {
  const m = question.match(/[\u4e00-\u9fff]{2,}/g);
  if (m?.length) {
    const longest = [...m].sort((a, b) => b.length - a.length)[0]!;
    return longest.length >= 4 ? longest.slice(0, 6) : longest;
  }
  const en = question.match(/[A-Za-z]{4,}/g);
  return en?.[0]?.slice(0, 12) ?? question.slice(0, 8);
}

async function fetchFromBq(limit = 80): Promise<RetrievalGoldCase[]> {
  const projectId = getBigQueryProjectId();
  if (!projectId) return [];

  const dataset = getBigQueryDataset();
  const table = getSalesKnowledgeTableId();
  const client = getBigQueryClient();

  const [rows] = await client.query({
    query: `
      SELECT customer_question, product_line, material_category, source_locator
      FROM \`${projectId}.${dataset}.${table}\`
      WHERE TRIM(COALESCE(customer_question, '')) != ''
        AND LENGTH(TRIM(customer_question)) >= 6
      ORDER BY RAND()
      LIMIT ${limit}
    `,
  });

  const cases: RetrievalGoldCase[] = [];
  for (const row of rows as Array<Record<string, string>>) {
    const cq = row.customer_question?.trim() ?? "";
    if (!cq) continue;
    const id = `bq-${cases.length + 1}`;
    cases.push({
      id,
      query: cq,
      expectQuestionContains: coreTerm(cq),
      expectSourceLocator: row.source_locator ?? undefined,
      productLine: row.product_line ?? "xtrail-ice",
      materialCategory: row.material_category ?? undefined,
    });

    for (const variant of paraphraseQuestion(cq)) {
      cases.push({
        id: `${id}-p`,
        query: variant,
        expectQuestionContains: coreTerm(cq),
        expectSourceLocator: row.source_locator ?? undefined,
        productLine: row.product_line ?? "xtrail-ice",
      });
    }
  }
  return cases;
}

async function main() {
  loadEnv();

  const manualPath = path.join(webRoot, "data", "retrieval-gold-manual.json");
  const manual: RetrievalGoldCase[] = fs.existsSync(manualPath)
    ? JSON.parse(fs.readFileSync(manualPath, "utf8"))
    : [];

  let auto: RetrievalGoldCase[] = [];
  try {
    auto = await fetchFromBq(Number(process.env.RETRIEVAL_GOLD_BQ_SAMPLE ?? 60));
    console.log(`BQ sample: ${auto.length} cases`);
  } catch (e) {
    console.warn("BQ export skipped:", (e as Error).message);
  }

  const merged = [...manual, ...auto];
  const outPath = path.join(webRoot, "data", "retrieval-gold.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: merged.length,
        cases: merged,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Wrote ${merged.length} cases → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
