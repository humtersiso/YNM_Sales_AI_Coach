/**
 * 檢查 knowledge_units 亂碼（xlsx 當 utf8、控制字元等）
 */
import { BigQuery } from "@google-cloud/bigquery";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
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

function normalizeKnowledgeText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u000b/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .replace(/\uFFFD/g, "")
    .trim();
}

function isGarbled(text) {
  const t = normalizeKnowledgeText(text);
  if (!t || t.length < 4) return false;
  if (t.startsWith("PK") && (t.includes("[Content_Types]") || t.includes("xmlschemas"))) return true;
  if (t.includes("[Content_Types].xml") || t.includes("_rels/.rels")) return true;
  const replacement = (t.match(/\uFFFD/g) || []).length;
  if (replacement > 2) return true;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const printable = (t.match(/[\u4e00-\u9fffA-Za-z0-9\s，。、？！：；「」（）\-_%]/g) || []).length;
  if (t.length > 40 && cjk === 0 && printable / t.length < 0.35) return true;
  return false;
}

loadEnv();
const projectId = process.env.BIGQUERY_PROJECT_ID;
const dataset = process.env.BIGQUERY_DATASET;

const client = new BigQuery({ projectId });
const sql = `
  SELECT unit_id, asset_id, product_line, material_category, unit_type,
    customer_question, standard_script, title, source_locator
  FROM \`${projectId}.${dataset}.knowledge_units\`
`;

const [rows] = await client.query({ query: sql });
const bad = [];
for (const r of rows) {
  const fields = {
    customer_question: String(r.customer_question ?? ""),
    standard_script: String(r.standard_script ?? ""),
    title: String(r.title ?? ""),
  };
  for (const [name, val] of Object.entries(fields)) {
    if (isGarbled(val)) {
      bad.push({
        unit_id: r.unit_id,
        field: name,
        material_category: r.material_category,
        unit_type: r.unit_type,
        title: r.title,
        preview: val.slice(0, 100),
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      total: rows.length,
      garbledCount: bad.length,
      samples: bad.slice(0, 20),
      byCategory: bad.reduce((acc, b) => {
        const k = `${b.material_category}/${b.field}`;
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
    },
    null,
    2,
  ),
);
