/**
 * 批次匯入 XTRAIL ICE 訓練素材 → source_assets + knowledge_units
 * 用法：npx tsx scripts/ingest-xtrail-batch.ts [--root=PATH] [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runIngestBatch } from "../src/lib/ingest/pipeline/ingest-batch";

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

function resolveRoot(): string {
  const arg = process.argv.find((a) => a.startsWith("--root="));
  if (arg) return path.resolve(arg.slice("--root=".length));
  if (process.env.XTRAIL_ICE_SOURCE_ROOT) return path.resolve(process.env.XTRAIL_ICE_SOURCE_ROOT);
  return path.join(webRoot, "data", "xtrail-ice");
}

loadEnv();
const root = resolveRoot();
const dryRun = process.argv.includes("--dry-run");

if (!fs.existsSync(root)) {
  console.error("素材根目錄不存在:", root);
  process.exit(1);
}

runIngestBatch({ rootDir: root, dryRun })
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exit(1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
