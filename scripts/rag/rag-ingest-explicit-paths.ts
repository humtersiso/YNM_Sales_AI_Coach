/**
 * 將指定檔案匯入 Vertex RAG Engine 語料庫（sales_script / competitor_compare / product_info）
 * 用法：npx tsx scripts/rag/rag-ingest-explicit-paths.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import type { DiscoveredFile } from "@/lib/ingest/adapters/base-source-adapter";
import { xlsxAdapter } from "@/lib/ingest/adapters/xlsx-adapter";
import { extensionOf, tagsFromRelativePath } from "@/lib/ingest/contracts/training-source-manifest";
import { getRagCorpusForCategory } from "@/lib/rag/rag-engine-config";
import {
  uploadLocalFileToRagCorpus,
  uploadTextSnippetToRagCorpus,
} from "@/lib/rag/vertex-rag-upload";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "../..");

const MATERIALS_BASE = path.join(
  webRoot,
  "..",
  "20260625",
  "New X-Trail 最新話術_總管理處_0624_v2",
);

const JOBS: { category: MaterialCategory; paths: string[] }[] = [
  {
    category: "sales_script",
    paths: [path.join(MATERIALS_BASE, "3. Q&A", "對練Q&A_X-TRAIL_0624.xlsx")],
  },
  {
    category: "competitor_compare",
    paths: [path.join(MATERIALS_BASE, "2. 競品資訊", "NEW X-Trail 競比攻防策略0610.pdf")],
  },
  {
    category: "product_info",
    paths: [path.join(MATERIALS_BASE, "1. 本品資訊")],
  },
];

function loadEnv() {
  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
  }
}

function expandPaths(entry: string): string[] {
  if (!fs.existsSync(entry)) return [];
  const st = fs.statSync(entry);
  if (st.isFile()) return [entry];
  const out: string[] = [];
  for (const ent of fs.readdirSync(entry, { withFileTypes: true })) {
    if (!ent.isFile()) continue;
    if (ent.name.startsWith("~$")) continue;
    out.push(path.join(entry, ent.name));
  }
  return out.sort();
}

function unitToBody(q: string | null, script: string | null, title: string | null): string {
  const parts: string[] = [];
  if (title?.trim()) parts.push(`【標題】${title.trim()}`);
  if (q?.trim()) parts.push(`【問題】${q.trim()}`);
  if (script?.trim()) parts.push(`【內容】${script.trim()}`);
  return parts.join("\n").slice(0, 48000);
}

async function ingestXlsx(filePath: string, category: MaterialCategory, corpus: string) {
  const fileName = path.basename(filePath);
  const file: DiscoveredFile = {
    absolutePath: filePath,
    relativePath: `sales-script/${fileName}`,
    fileName,
    extension: extensionOf(fileName),
    size: fs.statSync(filePath).size,
  };
  const ctx = {
    ingestBatchId: randomUUID(),
    assetId: randomUUID(),
    asset: {} as never,
    tags: tagsFromRelativePath(file.relativePath, "xtrail-ice"),
    ingestedAt: new Date().toISOString(),
    productLine: "xtrail-ice",
  };
  const result = await xlsxAdapter.parse(file, ctx);
  if (!result.units.length) {
    throw new Error(`Excel 無可匯入列: ${result.parseError ?? "空檔"}`);
  }

  console.log(`  解析 ${fileName} → ${result.units.length} 列，上傳至 ${category}…`);
  let n = 0;
  for (const u of result.units) {
    const body = unitToBody(u.customer_question, u.standard_script, u.title);
    if (body.length < 8) continue;
    const label = (u.customer_question ?? u.title ?? fileName).slice(0, 120);
    await uploadTextSnippetToRagCorpus(corpus, `${fileName} / ${label}`, body);
    n += 1;
    if (n % 20 === 0) console.log(`    …已上傳 ${n} 列`);
  }
  console.log(`  ✓ ${fileName} 共上傳 ${n} 列`);
}

async function ingestBinary(filePath: string, category: MaterialCategory, corpus: string) {
  const fileName = path.basename(filePath);
  console.log(`  上傳 ${fileName} → ${category}…`);
  const name = await uploadLocalFileToRagCorpus(corpus, filePath, fileName);
  console.log(`  ✓ ${fileName} (${name})`);
}

async function main() {
  loadEnv();
  console.log("素材根目錄:", MATERIALS_BASE);
  if (!fs.existsSync(MATERIALS_BASE)) {
    throw new Error("找不到素材目錄，請確認 20260625 資料夾路徑");
  }

  for (const job of JOBS) {
    const corpus = getRagCorpusForCategory(job.category);
    if (!corpus?.ragCorpusResource?.includes("/ragCorpora/")) {
      throw new Error(`未設定 RAG 語料庫: ${job.category}`);
    }
    const resource = corpus.ragCorpusResource;
    console.log(`\n=== ${job.category} → ${resource.split("/").pop()} ===`);

    for (const entry of job.paths) {
      const files = expandPaths(entry);
      if (!files.length) {
        console.warn("  略過（不存在或無檔案）:", entry);
        continue;
      }
      for (const fp of files) {
        const ext = path.extname(fp).toLowerCase();
        if (ext === ".xlsx" || ext === ".xls") {
          await ingestXlsx(fp, job.category, resource);
        } else {
          await ingestBinary(fp, job.category, resource);
        }
      }
    }
  }

  console.log("\n完成。索引需數分鐘；完成後可執行 npm run test:rag-search 驗證。");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
