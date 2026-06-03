/**
 * Function Calling 模式快測（SALES_CHAT_MODE=agent）
 * 用法：npx tsx scripts/test-sales-chat-fc.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithSalesAgent } from "../src/lib/gemini/sales-agent-orchestrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const SAMPLES = [
  "TERRITORY_YT負評影片 在哪裡? 還有相關的資訊有?",
  "FORD Territory 對戰話術重點",
  "ProPILOT 跟競品差在哪",
  "客戶問今天天氣如何",
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
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnv();
  process.env.SALES_CHAT_MODE = "agent";
  console.log("模式: Function Calling (agent)\n");

  for (const q of SAMPLES) {
    const start = performance.now();
    const r = await chatWithSalesAgent(q, {
      productLine: "xtrail-ice",
      materialCategory: "competitor_compare",
    });
    const ms = Math.round(performance.now() - start);
    console.log(`\n--- ${ms}ms ---`);
    console.log(`Q: ${q}`);
    console.log(`命中: ${r.inQuestionBank ? "是" : "否"} | 列點: ${r.bullets.length}`);
    if (r.reply) console.log(`結論: ${r.reply}`);
    r.bullets.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    if (r.citations[0]) console.log(`來源: ${r.citations[0].question.slice(0, 60)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
