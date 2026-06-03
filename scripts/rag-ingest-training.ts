/**
 * 將訓練素材解析後寫入 Vertex AI Search（CONTENT_REQUIRED 三語料庫）
 * 用法：
 *   npx tsx scripts/rag-ingest-training.ts --product-line=xtrail-ice
 *   npx tsx scripts/rag-ingest-training.ts --all
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MaterialCategory } from "../src/lib/ingest/contracts/material-category-contract";
import type { KnowledgeUnitRow } from "../src/lib/ingest/contracts/knowledge-unit-contract";
import { collectKnowledgeUnitsForRag } from "../src/lib/ingest/pipeline/ingest-batch";
import { getRagCorpusForCategory, listConfiguredRagCorpora } from "../src/lib/rag/rag-engine-config";
import {
  stableRagDocumentId,
  upsertRagDocument,
} from "../src/lib/rag/rag-document-client";

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
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function argValue(prefix: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : undefined;
}

function resolveMaterialsRoot(): string {
  if (process.env.TRAINING_MATERIALS_ROOT) return path.resolve(process.env.TRAINING_MATERIALS_ROOT);
  return path.join(webRoot, "data", "training-materials");
}

function unitToBody(u: KnowledgeUnitRow): string {
  const q = u.customer_question?.trim() ?? "";
  const script = u.standard_script?.trim() ?? "";
  const title = u.title?.trim() ?? "";
  const parts: string[] = [];
  if (title) parts.push(`【標題】${title}`);
  if (q) parts.push(`【問題】${q}`);
  if (script) parts.push(`【內容】${script}`);
  return parts.join("\n").slice(0, 48000);
}

function unitTitle(u: KnowledgeUnitRow): string {
  return (
    u.customer_question?.trim() ||
    u.title?.trim() ||
    u.standard_script?.trim().slice(0, 120) ||
    "知識片段"
  );
}

async function ingestUnits(units: KnowledgeUnitRow[]) {
  const byCategory = new Map<MaterialCategory, KnowledgeUnitRow[]>();
  for (const u of units) {
    const cat = (u.material_category ?? "general") as MaterialCategory;
    const list = byCategory.get(cat) ?? [];
    list.push(u);
    byCategory.set(cat, list);
  }

  let written = 0;
  let skipped = 0;

  for (const [category, rows] of byCategory) {
    const corpus = getRagCorpusForCategory(category);
    if (!corpus) {
      console.warn(`略過 ${category}：未設定對應 RAG_DATASTORE_*`);
      skipped += rows.length;
      continue;
    }

    for (const u of rows) {
      const body = unitToBody(u);
      if (body.length < 8) {
        skipped += 1;
        continue;
      }
      const documentId = stableRagDocumentId([
        u.product_line ?? "",
        category,
        u.content_hash,
        u.source_locator ?? "",
      ]);
      await upsertRagDocument(corpus.dataStoreResource, {
        documentId,
        title: unitTitle(u),
        body,
        materialCategory: category,
        productLine: u.product_line ?? "xtrail-ice",
        sourceLocator: u.source_locator ?? undefined,
      });
      written += 1;
      if (written % 25 === 0) console.log(`  …已寫入 ${written} 筆`);
    }
  }

  return { written, skipped };
}

async function main() {
  loadEnv();
  const corpora = listConfiguredRagCorpora();
  if (corpora.length === 0) {
    console.error("請先設定 RAG_DATASTORE_*（可執行 npm run rag:setup）");
    process.exit(1);
  }

  const materialsRoot = resolveMaterialsRoot();
  const ingestAll = process.argv.includes("--all");
  const productLine = argValue("--product-line=");
  const roots: { root: string; line: string }[] = [];

  if (ingestAll) {
    for (const ent of fs.readdirSync(materialsRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      roots.push({ root: path.join(materialsRoot, ent.name), line: ent.name });
    }
  } else {
    const line = productLine ?? "xtrail-ice";
    roots.push({ root: path.join(materialsRoot, line), line });
  }

  let totalWritten = 0;
  let totalSkipped = 0;

  for (const { root, line } of roots) {
    if (!fs.existsSync(root)) {
      console.warn("目錄不存在，略過:", root);
      continue;
    }
    console.log("\n匯入", line, root);
    const units = await collectKnowledgeUnitsForRag({
      rootDir: root,
      materialsRoot,
      productLine: line,
    });
    console.log("解析筆數:", units.length);
    const { written, skipped } = await ingestUnits(units);
    totalWritten += written;
    totalSkipped += skipped;
  }

  console.log("\n完成。寫入", totalWritten, "略過", totalSkipped);
  console.log("索引需數分鐘；期間檢索會使用 list fallback。完成後請跑：npm run test:rag-search");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
