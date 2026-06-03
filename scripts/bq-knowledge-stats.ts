import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBigQueryClient } from "../src/lib/bq/script-drills-insert";
import {
  getBigQueryDataset,
  getBigQueryProjectId,
  getSalesKnowledgeTableId,
} from "../src/lib/bq/knowledge-config";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(webRoot, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

async function main() {
  const p = getBigQueryProjectId();
  const d = getBigQueryDataset();
  const t = getSalesKnowledgeTableId();
  const client = getBigQueryClient();
  const table = `\`${p}.${d}.${t}\``;

  const [total] = await client.query({ query: `SELECT COUNT(*) AS c FROM ${table}` });
  const [hp] = await client.query({
    query: `SELECT COUNT(*) AS c FROM ${table}
      WHERE LOWER(standard_script_idea) LIKE '%馬力%'
         OR LOWER(customer_question) LIKE '%馬力%'
         OR LOWER(standard_script_idea) LIKE '%ps%'`,
  });
  const [avg] = await client.query({
    query: `SELECT
      AVG(LENGTH(standard_script_idea)) AS avg_script,
      AVG(LENGTH(customer_question)) AS avg_cq
    FROM ${table}`,
  });
  console.log(JSON.stringify({ total: total[0].c, horsepowerLike: hp[0].c, avg: avg[0] }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
