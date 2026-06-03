import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
}
import { getBigQueryClient } from "../src/lib/bq/script-drills-insert";
import { getBigQueryDataset, getBigQueryProjectId } from "../src/lib/bq/knowledge-config";

const p = getBigQueryProjectId()!;
const d = getBigQueryDataset();
async function main() {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT product_line, COUNT(*) AS c FROM \`${p}.${d}.knowledge_units\` GROUP BY 1 ORDER BY c DESC`,
  });
  console.log(rows);
}
void main();
