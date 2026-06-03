/**
 * 固定 24 題：RAG vs BQ 並跑比對（與 2026-06-02 BQ 驗收題目一致）
 * 用法：npx tsx scripts/compare-rag-bq-suite.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import type { SalesChatResult } from "../src/lib/gemini/sales-chat-types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const OUT_OF_SCOPE_SNIPPET = "與目前話術知識庫內容不符";
const NOT_IN_BANK_SNIPPET = "尚無此問題的標準話術";
const COST_NUMERIC = /\d[\d,.]{3,}|[\d,.]+\s*萬|\d+\s*元/;

/** 昨日 BQ 跑 suite 時的固定題目與結果（21/24 pass） */
const BQ_BASELINE: Record<string, boolean> = {
  "qa-1": true,
  "qa-2": true,
  "qa-3": true,
  "product-1": true,
  "product-2": true,
  "product-3": true,
  "competitor-1": true,
  "competitor-2": true,
  "competitor-3": false,
  "competitor-4": true,
  "competitor-5": true,
  "spec-hp-short": true,
  "spec-hp-how": true,
  "spec-hp": true,
  "spec-torque": false,
  "spec-fuel": true,
  "spec-size": false,
  "cost-tucson": true,
  "cost-tucson-detail": true,
  "guard-ufo": true,
  "guard-ferrari": true,
  "guard-tesla": true,
  "guard-bmw": true,
  "guard-porsche": true,
};

type CaseDef = {
  id: string;
  category: string;
  query: string;
  expectBlocked?: boolean;
  expectNumeric?: RegExp;
};

const FIXED_CASES: CaseDef[] = [
  { id: "qa-1", category: "qa", query: "現在折扣CR-V也很多，如果差不多價格，為何要選擇X-TRAIL，畢竟CR-V品質更加穩定" },
  { id: "qa-2", category: "qa", query: "雖然X-TRAIL優惠多 但是整體買下來的價格還是比TT貴 再考慮一下" },
  {
    id: "qa-3",
    category: "qa",
    query: "家人都開本田的車款，覺得操控性要好還是要買本田的CR-V，你們的車有什麼特色呢?",
  },
  { id: "product-1", category: "product", query: "X-TRAIL 媒體怎麼評價油耗？" },
  { id: "product-2", category: "product", query: "媒體怎麼評價 X-TRAIL 油耗？" },
  { id: "product-3", category: "product", query: "X-TRAIL 媒體試駕重點？" },
  { id: "competitor-1", category: "competitor", query: "TUCSON L 跟 X-TRAIL 配備差在哪？" },
  { id: "competitor-2", category: "competitor", query: "TUCSON L 跟 X-TRAIL 配備差在哪？" },
  { id: "competitor-3", category: "competitor", query: "X-TRAIL 跟 RAV4 油耗怎麼比？" },
  { id: "competitor-4", category: "competitor", query: "TUCSON L 跟 X-TRAIL 配備差在哪？" },
  { id: "competitor-5", category: "competitor", query: "Sportage 跟 X-TRAIL 動力怎麼比？" },
  { id: "spec-hp-short", category: "spec", query: "馬力", expectNumeric: /\d+\s*ps|204/i },
  { id: "spec-hp-how", category: "spec", query: "馬力如何", expectNumeric: /\d+\s*ps|204/i },
  { id: "spec-hp", category: "spec", query: "X-TRAIL ICE 的馬力如何？", expectNumeric: /\d+\s*ps|204/i },
  {
    id: "spec-torque",
    category: "spec",
    query: "X-TRAIL 最大扭力多少？",
    expectNumeric: /30\.?\d*\s*kgm|扭力.*\d/i,
  },
  {
    id: "spec-fuel",
    category: "spec",
    query: "X-TRAIL ICE 油耗大概多少？",
    expectNumeric: /\d+(\.\d+)?\s*(km\/L|km\/l|公里)/i,
  },
  {
    id: "spec-size",
    category: "spec",
    query: "X-TRAIL 車長軸距尺寸？",
    expectNumeric: /\d{3,4}\s*(mm|公分|cm)|軸距|車長/i,
  },
  { id: "cost-tucson", category: "cost", query: "TUCSON L 長期持有成本", expectNumeric: COST_NUMERIC },
  {
    id: "cost-tucson-detail",
    category: "cost",
    query: "TUCSON L 長期持有成本詳細數字是？",
    expectNumeric: COST_NUMERIC,
  },
  { id: "guard-ufo", category: "guard", query: "UFO 01 跟 X-TRAIL 差在哪", expectBlocked: true },
  { id: "guard-ferrari", category: "guard", query: "法拉利 SF90 跟 X-TRAIL 比怎麼回", expectBlocked: true },
  { id: "guard-tesla", category: "guard", query: "Tesla Model Y 值得買嗎", expectBlocked: true },
  { id: "guard-bmw", category: "guard", query: "BMW X5 油耗多少", expectBlocked: true },
  { id: "guard-porsche", category: "guard", query: "保時捷 Cayenne 跟 X-TRAIL 怎麼比", expectBlocked: true },
];

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
    process.env[k] = v;
  }
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

function evaluate(c: CaseDef, r: SalesChatResult): { pass: boolean; reason: string } {
  if (c.expectBlocked) {
    const pass = isOutOfScopeReply(r);
    return { pass, reason: pass ? "已阻擋" : "未阻擋" };
  }
  if (c.category === "spec" || c.category === "cost") {
    if (isOutOfScopeReply(r)) return { pass: false, reason: "誤判不符" };
    const pass = Boolean(c.expectNumeric?.test(fullReply(r)));
    return { pass, reason: pass ? "含數字" : "缺數字" };
  }
  const pass = isSubstantiveContent(r);
  return {
    pass,
    reason: pass ? "有回覆" : isOutOfScopeReply(r) ? "誤判不符" : "無資料",
  };
}

async function runBackend(
  backend: "rag" | "bq",
  cases: CaseDef[],
): Promise<Map<string, { pass: boolean; reason: string; preview: string; cites: number }>> {
  process.env.SALES_KNOWLEDGE_BACKEND = backend;
  const out = new Map<string, { pass: boolean; reason: string; preview: string; cites: number }>();
  for (const c of cases) {
    const r = await chatWithDataAgent(c.query, { productLine: "xtrail-ice" });
    const ev = evaluate(c, r);
    out.set(c.id, {
      ...ev,
      preview: fullReply(r).slice(0, 90).replace(/\s+/g, " "),
      cites: r.citations.length,
    });
    console.log(`  [${backend}] ${ev.pass ? "PASS" : "FAIL"} ${c.id}`);
  }
  return out;
}

async function main() {
  loadEnv();
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const cases = only
    ? FIXED_CASES.filter((c) => c.id === only || c.category === only)
    : FIXED_CASES;

  console.log("固定題數:", cases.length);
  console.log("RAG:", process.env.RAG_RETRIEVAL_API ?? "auto", "| corpus configured");

  console.log("\n--- 執行 RAG ---");
  const rag = await runBackend("rag", cases);

  console.log("\n--- 執行 BQ（即時重跑，與昨日 baseline 對照）---");
  const bqLive = await runBackend("bq", cases);

  let ragPass = 0;
  let bqLivePass = 0;
  let bqBasePass = 0;
  let ragBetter = 0;
  let ragWorse = 0;

  console.log("\n| ID | 類別 | BQ昨日 | BQ即時 | RAG | 變化 |");
  console.log("|----|------|--------|--------|-----|------|");

  for (const c of cases) {
    const r = rag.get(c.id)!;
    const b = bqLive.get(c.id)!;
    const base = BQ_BASELINE[c.id];
    if (r.pass) ragPass += 1;
    if (b.pass) bqLivePass += 1;
    if (base) bqBasePass += 1;

    let delta = "—";
    if (r.pass && !base) {
      delta = "RAG↑";
      ragBetter += 1;
    } else if (!r.pass && base) {
      delta = "RAG↓";
      ragWorse += 1;
    } else if (r.pass && base) delta = "同過";

    const mark = (ok: boolean) => (ok ? "✓" : "✗");
    console.log(
      `| ${c.id} | ${c.category} | ${mark(base)} | ${mark(b.pass)} | ${mark(r.pass)} | ${delta} |`,
    );
    if (r.pass !== b.pass || r.pass !== base) {
      console.log(`  Q: ${c.query.slice(0, 55)}…`);
      if (!r.pass) console.log(`  RAG: ${r.reason} | ${r.preview}`);
      if (!b.pass) console.log(`  BQ:  ${b.reason} | ${b.preview}`);
    }
  }

  console.log("\n## 摘要");
  console.log(`BQ 昨日（紀錄）: ${bqBasePass}/${cases.length}`);
  console.log(`BQ 即時重跑:     ${bqLivePass}/${cases.length}`);
  console.log(`RAG 即時:        ${ragPass}/${cases.length}`);
  console.log(`RAG 較昨日 BQ 多過: ${ragBetter} 題 | 少過: ${ragWorse} 題`);

  const outPath = path.join(webRoot, "data", "compare-rag-bq-latest.txt");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    [
      `generated: ${new Date().toISOString()}`,
      `bq_baseline: ${bqBasePass}/${cases.length}`,
      `bq_live: ${bqLivePass}/${cases.length}`,
      `rag: ${ragPass}/${cases.length}`,
      `rag_better: ${ragBetter}`,
      `rag_worse: ${ragWorse}`,
    ].join("\n"),
    "utf8",
  );
  console.log("已寫入", outPath);

  if (ragPass < bqLivePass) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
