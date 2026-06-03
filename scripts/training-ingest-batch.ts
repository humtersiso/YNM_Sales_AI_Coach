/**
 * 批次匯入訓練素材（支援多車款）
 * 用法：
 *   npx tsx scripts/training-ingest-batch.ts --all
 *   npx tsx scripts/training-ingest-batch.ts --product-line=xtrail-ice
 *   npx tsx scripts/training-ingest-batch.ts --root=PATH [--product-line=slug]
 *   npx tsx scripts/training-ingest-batch.ts --product-line=xtrail-ice --only-ext=.xlsx
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runIngestAllProductLines, runIngestBatch } from "../src/lib/ingest/pipeline/ingest-batch";

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

function resolveMaterialsRoot(): string {
  if (process.env.TRAINING_MATERIALS_ROOT) return path.resolve(process.env.TRAINING_MATERIALS_ROOT);
  if (process.env.XTRAIL_ICE_SOURCE_ROOT) return path.resolve(process.env.XTRAIL_ICE_SOURCE_ROOT);
  return path.join(webRoot, "data", "training-materials");
}

function argValue(prefix: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : undefined;
}

loadEnv();
const dryRun = process.argv.includes("--dry-run");
const ingestAll = process.argv.includes("--all");
const productLine = argValue("--product-line=");
const rootArg = argValue("--root=");
const onlyExtRaw = argValue("--only-ext=");
const extensionsOnly = onlyExtRaw
  ? onlyExtRaw.split(",").map((e) => (e.startsWith(".") ? e : `.${e}`))
  : undefined;
const materialsRoot = resolveMaterialsRoot();

async function main() {
  if (ingestAll) {
    if (!fs.existsSync(materialsRoot)) {
      console.error("多車款根目錄不存在:", materialsRoot);
      process.exit(1);
    }
    const reports = await runIngestAllProductLines({ materialsRoot, dryRun });
    console.log(JSON.stringify(reports, null, 2));
    if (reports.some((r) => r.errors.length)) process.exit(1);
    return;
  }

  let root = rootArg ? path.resolve(rootArg) : materialsRoot;
  if (productLine && !rootArg) {
    root = path.join(materialsRoot, productLine);
  }

  if (!fs.existsSync(root)) {
    console.error("匯入目錄不存在:", root);
    process.exit(1);
  }

  const report = await runIngestBatch({
    rootDir: root,
    materialsRoot,
    productLine,
    extensionsOnly,
    dryRun,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
