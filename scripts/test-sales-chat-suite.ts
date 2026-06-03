/**
 * 銷售助手五大類驗收（端到端 chatWithDataAgent）
 * 1. QA xlsx 隨機 3 題（檔案或 BQ sales_script）
 * 2. 本品媒體 pptx 隨機 3 題
 * 3. 競品資料夾隨機 5 題
 * 4. 規格延伸（馬力/扭力/油耗/尺寸）須含數字
 * 5. 防呆未收錄車款 → 知識庫不符訊息
 *
 * 用法：npx tsx scripts/test-sales-chat-suite.ts
 *       npx tsx scripts/test-sales-chat-suite.ts --rounds=3
 *
 * RAG 模式：SALES_KNOWLEDGE_BACKEND=rag 且已設定 RAG_DATASTORE_* 時走 Agent Search；
 * 預設本機 .env 若為 bq 則仍測 BigQuery 檢索。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { getBigQueryClient } from "../src/lib/bq/script-drills-insert";
import { getBigQueryDataset, getBigQueryProjectId } from "../src/lib/bq/knowledge-config";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import type { SalesChatResult } from "../src/lib/gemini/sales-chat-types";
import { outOfScopeKnowledgeMessage } from "../src/lib/gemini/reply-format";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const DATA_ROOT = path.join(webRoot, "data", "training-materials", "xtrail-ice");

const QA_XLSX = path.join(
  DATA_ROOT,
  "sales-script",
  "T33 ICE 菁英話術Q&A.xlsx",
);
const MEDIA_PPTX = path.join(DATA_ROOT, "product-info", "X-TRAIL 媒體報導彙整_202602.pptx");
const COMPETITOR_DIR = path.join(DATA_ROOT, "competitor-compare");

const OUT_OF_SCOPE_SNIPPET = "與目前話術知識庫內容不符";
const NOT_IN_BANK_SNIPPET = "尚無此問題的標準話術";

/** 持有成本試算表須回具體金額（非僅「項目架構」） */
const COST_NUMERIC = /\d[\d,.]{3,}|[\d,.]+\s*萬|\d+\s*元/;

const COST_CASES = [
  { id: "cost-tucson", q: "TUCSON L 長期持有成本", pattern: COST_NUMERIC },
  {
    id: "cost-tucson-detail",
    q: "TUCSON L 長期持有成本詳細數字是？",
    pattern: COST_NUMERIC,
  },
];

const SPEC_CASES = [
  { id: "spec-hp-short", q: "馬力", pattern: /\d+\s*ps|204/i },
  { id: "spec-hp-how", q: "馬力如何", pattern: /\d+\s*ps|204/i },
  { id: "spec-hp", q: "X-TRAIL ICE 的馬力如何？", pattern: /\d+\s*ps|204/i },
  { id: "spec-torque", q: "X-TRAIL 最大扭力多少？", pattern: /30\.?\d*\s*kgm|扭力.*\d/i },
  { id: "spec-fuel", q: "X-TRAIL ICE 油耗大概多少？", pattern: /\d+(\.\d+)?\s*(km\/L|km\/l|公里)/i },
  { id: "spec-size", q: "X-TRAIL 車長軸距尺寸？", pattern: /\d{3,4}\s*(mm|公分|cm)|軸距|車長/i },
];

const GUARD_CASES = [
  { id: "guard-ufo", q: "UFO 01 跟 X-TRAIL 差在哪" },
  { id: "guard-ferrari", q: "法拉利 SF90 跟 X-TRAIL 比怎麼回" },
  { id: "guard-tesla", q: "Tesla Model Y 值得買嗎" },
  { id: "guard-bmw", q: "BMW X5 油耗多少" },
  { id: "guard-porsche", q: "保時捷 Cayenne 跟 X-TRAIL 怎麼比" },
];

type SuiteCase = {
  id: string;
  category: "qa" | "product" | "competitor" | "spec" | "cost" | "guard";
  query: string;
  expectNumeric?: RegExp;
  expectBlocked?: boolean;
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandomUnique<T>(arr: T[], n: number, key: (item: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of shuffle(arr)) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= n) break;
  }
  return out;
}

function readQaFromXlsx(): string[] {
  if (!fs.existsSync(QA_XLSX)) return [];
  const wb = XLSX.readFile(QA_XLSX);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
  const questions: string[] = [];
  for (const row of rows) {
    const q =
      row["客戶疑問"] ??
      row["客户疑问"] ??
      row["customer_question"] ??
      Object.values(row).find((v) => typeof v === "string" && /[？?]/.test(v));
    if (typeof q !== "string") continue;
    const t = q.trim();
    if (t.length < 8 || t.length > 85) continue;
    if (/[\r\n]/.test(t) || t.split("\n").length > 1) continue;
    if (/^X-TRAIL\s*\/\s*Territory|三台車都是|油電混和系統動力/i.test(t)) continue;
    if (!/[？?]|怎麼|如何|嗎|呢|擔心|覺得|太貴|優惠|試乘|試駕/.test(t)) continue;
    questions.push(t);
  }
  return [...new Set(questions)];
}

async function sampleFromBq(sql: string): Promise<string[]> {
  const projectId = getBigQueryProjectId();
  const dataset = getBigQueryDataset();
  if (!projectId) return [];
  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: sql.replace(/\{project\}/g, projectId).replace(/\{dataset\}/g, dataset),
  });
  return (rows as { q: string }[]).map((r) => r.q?.trim()).filter((q) => q && q.length >= 4);
}

async function buildQaCases(): Promise<SuiteCase[]> {
  let pool = readQaFromXlsx();
  if (pool.length < 3) {
    pool = await sampleFromBq(`
      SELECT customer_question AS q
      FROM \`{project}.{dataset}.knowledge_units\`
      WHERE material_category = 'sales_script'
        AND unit_type = 'qa_pair'
        AND LENGTH(TRIM(customer_question)) BETWEEN 6 AND 120
        AND customer_question NOT LIKE '%.pdf%'
        AND customer_question NOT LIKE '%.pptx%'
      ORDER BY RAND()
      LIMIT 30`);
  }
  return pickRandomUnique(pool, 3, (q) => q).map((query, i) => ({
    id: `qa-${i + 1}`,
    category: "qa" as const,
    query,
  }));
}

function mediaQuestionFromExcerpt(excerpt: string): string {
  const t = excerpt.replace(/\s+/g, " ").slice(0, 80);
  if (/油耗|省油/i.test(t)) return "X-TRAIL 媒體怎麼評價油耗？";
  if (/動力|馬力/i.test(t)) return "媒體報導怎麼說 X-TRAIL 動力？";
  if (/隔音|寧靜/i.test(t)) return "X-TRAIL 媒體有提到隔音嗎？";
  if (/安全|AEB|智行/i.test(t)) return "X-TRAIL 媒體報導的安全配備亮點？";
  return "X-TRAIL 媒體報導有哪些亮點？";
}

async function buildProductCases(): Promise<SuiteCase[]> {
  const rows = await sampleFromBq(`
    SELECT SUBSTR(standard_script, 1, 200) AS q
    FROM \`{project}.{dataset}.knowledge_units\`
    WHERE material_category = 'product_info'
      AND (title LIKE '%媒體報導彙整%' OR customer_question LIKE '%媒體報導彙整%')
      AND LENGTH(standard_script) > 40
    ORDER BY RAND()
    LIMIT 20`);
  const queries = rows.map((excerpt) => mediaQuestionFromExcerpt(excerpt));
  const unique = [...new Set(queries)];
  return pickRandomUnique(
    unique.length >= 3 ? unique : [...unique, "X-TRAIL 媒體報導有哪些亮點？", "媒體怎麼評價 X-TRAIL 油耗？", "X-TRAIL 媒體試駕重點？"],
    3,
    (q) => q,
  ).map(
    (query, i) => ({
      id: `product-${i + 1}`,
      category: "product" as const,
      query,
    }),
  );
}

function competitorQuestionFromFile(fileHint: string): string {
  const f = fileHint.toLowerCase();
  if (/rav4|cr-?v/.test(f)) return "X-TRAIL 跟 RAV4 油耗怎麼比？";
  if (/tucson|途勝/.test(f)) return "TUCSON L 跟 X-TRAIL 配備差在哪？";
  if (/territory|福特/.test(f)) return "Territory 跟 X-TRAIL 怎麼對戰？";
  if (/sportage/.test(f)) return "Sportage 跟 X-TRAIL 動力怎麼比？";
  if (/kuga/.test(f)) return "KUGA 跟 X-TRAIL 有什麼差異？";
  if (/yt|負評/.test(f)) return "競品 YT 負評影片可以怎麼回？";
  return "X-TRAIL 跟同級休旅相比，油耗與配備上有什麼優勢？";
}

const KNOWN_COMPETITOR_ASSET = /rav4|cr-?v|tucson|途勝|territory|福特|sportage|kuga|對戰|vs|改款|yt|負評/i;

async function buildCompetitorCases(): Promise<SuiteCase[]> {
  const fileHints: string[] = [];
  if (fs.existsSync(COMPETITOR_DIR)) {
    for (const name of fs.readdirSync(COMPETITOR_DIR)) {
      if (!/\.(pdf|pptx|ppt)$/i.test(name)) continue;
      if (!KNOWN_COMPETITOR_ASSET.test(name)) continue;
      fileHints.push(name.replace(/\.[^.]+$/, ""));
    }
  }
  if (fileHints.length < 5) {
    const fromBq = await sampleFromBq(`
      SELECT DISTINCT REGEXP_EXTRACT(COALESCE(title, customer_question), r'^([^()]+)') AS q
      FROM \`{project}.{dataset}.knowledge_units\`
      WHERE material_category = 'competitor_compare'
        AND (title LIKE '%.pdf%' OR customer_question LIKE '%.pdf%' OR title LIKE '%.pptx%')
      ORDER BY RAND()
      LIMIT 15`);
    fileHints.push(...fromBq);
  }
  const unique = [...new Set(fileHints)].filter(Boolean);
  return pickRandomUnique(unique, 5, (h) => h).map((hint, i) => ({
    id: `competitor-${i + 1}`,
    category: "competitor" as const,
    query: competitorQuestionFromFile(hint),
  }));
}

function fullReply(r: SalesChatResult): string {
  return [r.reply, ...r.bullets].join(" ");
}

function isOutOfScopeReply(r: SalesChatResult): boolean {
  const t = fullReply(r);
  return (
    t.includes(OUT_OF_SCOPE_SNIPPET) ||
    (t.includes("無法依建檔資料回答") && t.includes("待新增題庫清單"))
  );
}

function isSubstantiveContent(r: SalesChatResult): boolean {
  if (isOutOfScopeReply(r)) return false;
  if (fullReply(r).includes(NOT_IN_BANK_SNIPPET) && r.citations.length === 0) return false;
  const text = fullReply(r).trim();
  return text.length >= 24 && (r.bullets.length > 0 || r.citations.length > 0);
}

type EvalResult = { case: SuiteCase; pass: boolean; reason: string; preview: string };

async function evaluate(c: SuiteCase): Promise<EvalResult> {
  const r = await chatWithDataAgent(c.query, { productLine: "xtrail-ice" });
  const preview = fullReply(r).slice(0, 120).replace(/\s+/g, " ");

  if (c.expectBlocked) {
    const pass = isOutOfScopeReply(r);
    return {
      case: c,
      pass,
      reason: pass ? "已阻擋" : "應回知識庫不符但未阻擋",
      preview,
    };
  }

  if (c.category === "spec" || c.category === "cost") {
    if (isOutOfScopeReply(r)) {
      return { case: c, pass: false, reason: "被誤判為知識庫不符", preview };
    }
    const pass = Boolean(c.expectNumeric?.test(fullReply(r)));
    const label = c.category === "cost" ? "含成本金額" : "含規格數字";
    return {
      case: c,
      pass,
      reason: pass ? label : "缺少可核對數字",
      preview,
    };
  }

  const pass = isSubstantiveContent(r);
  return {
    case: c,
    pass,
    reason: pass ? "有實質回覆" : isOutOfScopeReply(r) ? "被誤判為知識庫不符" : "無內容或題庫無資料",
    preview,
  };
}

async function runRound(round: number, cases: SuiteCase[]): Promise<number> {
  console.log(`\n======== 第 ${round} 輪 ========`);
  let failed = 0;
  for (const c of cases) {
    const res = await evaluate(c);
    const mark = res.pass ? "PASS" : "FAIL";
    if (!res.pass) failed += 1;
    console.log(`${mark} [${c.category}] ${c.id}`);
    console.log(`  Q: ${c.query.slice(0, 72)}`);
    console.log(`  ${res.reason} | ${res.preview}`);
  }
  console.log(`Round ${round}: ${cases.length - failed}/${cases.length} passed`);
  return failed;
}

async function main() {
  loadEnv();
  const roundsArg = process.argv.find((a) => a.startsWith("--rounds="));
  const rounds = roundsArg ? Math.max(1, Number(roundsArg.split("=")[1])) : 1;

  const qa = await buildQaCases();
  const product = await buildProductCases();
  const competitor = await buildCompetitorCases();
  const spec: SuiteCase[] = SPEC_CASES.map((s) => ({
    id: s.id,
    category: "spec",
    query: s.q,
    expectNumeric: s.pattern,
  }));
  const cost: SuiteCase[] = COST_CASES.map((s) => ({
    id: s.id,
    category: "cost",
    query: s.q,
    expectNumeric: s.pattern,
  }));
  const guard: SuiteCase[] = GUARD_CASES.map((g) => ({
    id: g.id,
    category: "guard",
    query: g.q,
    expectBlocked: true,
  }));

  const cases = [...qa, ...product, ...competitor, ...spec, ...cost, ...guard];
  console.log("Cases:", cases.length, {
    qa: qa.length,
    product: product.length,
    competitor: competitor.length,
    spec: spec.length,
    cost: cost.length,
    guard: guard.length,
  });
  console.log(
    "Knowledge backend:",
    (process.env.SALES_KNOWLEDGE_BACKEND ?? "rag").trim().toLowerCase(),
  );
  console.log("QA source:", fs.existsSync(QA_XLSX) ? "xlsx" : "BQ");
  console.log("Media file exists:", fs.existsSync(MEDIA_PPTX));
  console.log("Competitor dir files:", fs.existsSync(COMPETITOR_DIR) ? fs.readdirSync(COMPETITOR_DIR).length : 0);

  let totalFailed = 0;
  for (let r = 1; r <= rounds; r++) {
    totalFailed += await runRound(r, cases);
  }

  if (totalFailed > 0) {
    console.error(`\n${totalFailed} failure(s) across ${rounds} round(s).`);
    process.exit(1);
  }
  console.log(`\nAll ${rounds} round(s) passed (${cases.length} cases each).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
