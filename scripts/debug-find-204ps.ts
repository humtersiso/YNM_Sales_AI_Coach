import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  const v = m[2].trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}

import { getBigQueryClient } from "../src/lib/bq/script-drills-insert";
import { getSalesKnowledgeTableId } from "../src/lib/bq/knowledge-config";
import { getBigQueryScriptDrillsConfig } from "../src/lib/bq/script-drills-insert";

async function main() {
  const { projectId, dataset } = getBigQueryScriptDrillsConfig();
  const table = getSalesKnowledgeTableId();
  const fqn = `\`${projectId}.${dataset}.${table}\``;
  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: `
      SELECT customer_question, SUBSTR(standard_script_idea, 1, 200) AS script
      FROM ${fqn}
      WHERE REGEXP_CONTAINS(COALESCE(standard_script_idea, ''), r'204')
         OR REGEXP_CONTAINS(COALESCE(customer_question, ''), r'204')
      LIMIT 8
    `,
  });
  console.log("rows with 204 in BQ:", (rows as unknown[]).length);
  for (const r of rows as Record<string, string>[]) {
    console.log("---", r.customer_question?.slice(0, 60));
    console.log(r.script?.replace(/\n/g, " ").slice(0, 150));
  }
}

void main();
