import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const { fetchMainWorkbookFromBq, isBigQueryConfigured } = await import(
  "../src/lib/bq/script-drills-query.ts"
);

if (!isBigQueryConfigured()) {
  console.error("FAIL: BIGQUERY_PROJECT_ID not set");
  process.exit(1);
}

try {
  const r = await fetchMainWorkbookFromBq();
  console.log("OK source=", r.source);
  console.log("OK table=", r.dataSourceLabel);
  console.log("OK count=", r.duplicateCount);
  console.log("OK rows=", r.rowsGR.length);
  if (r.duplicateCount < 1 || r.rowsGR.length < 1) {
    console.error("FAIL: expected at least 1 row");
    process.exit(1);
  }
} catch (e) {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
}
