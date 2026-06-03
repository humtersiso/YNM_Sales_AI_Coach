/**
 * 三類問題實測（本品 / 競品 / QA）
 * 用法：npx tsx scripts/test-three-category-chat.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import { classifySalesQuestionByRules } from "../src/lib/gemini/sales-question-profile";

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

const CASES = [
  { label: "本品", q: "X-TRAIL 有 ProPILOT 嗎" },
  { label: "競品", q: "TUCSON L 持有成本" },
  { label: "QA話術", q: "客戶說太貴怎麼回" },
];

async function main() {
  loadEnv();
  process.env.SALES_CHAT_MODE = process.env.SALES_CHAT_MODE || "data-agent";
  console.log("模式:", process.env.SALES_CHAT_MODE);
  console.log("");

  for (const tc of CASES) {
    const profile = classifySalesQuestionByRules(tc.q);
    console.log(`\n${"=".repeat(40)}`);
    console.log(`【${tc.label}】${tc.q}`);
    console.log(`分類: ${profile.category} | 競品: ${profile.mentionedCompetitor ?? "-"}`);
    const start = performance.now();
    const r = await chatWithDataAgent(tc.q, {});
    const ms = Math.round(performance.now() - start);
    console.log(`耗時: ${ms}ms | 引用: ${r.citations?.length ?? 0} 筆`);
    console.log(`小結: ${r.reply || "（無）"}`);
    if (r.bullets.length > 0) {
      console.log("列點:");
      r.bullets.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
