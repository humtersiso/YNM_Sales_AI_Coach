/**
 * Data Agent 修復後快測（5 題）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataAgentChat } from "../src/lib/gemini/gemini-client";
import { buildBulletReplyFromText, isUsableReply } from "../src/lib/gemini/reply-format";
import { buildDataAgentUserPrompt } from "../src/lib/gemini/sales-reply-directives";
import { looksLikeTableDump } from "../src/lib/gemini/gemini-summarize";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

const CASES = [
  "TERRITORY_YT負評影片 在哪裡? 還有相關的資訊有?",
  "客戶擔心 X-TRAIL 油耗怎麼回？",
  "FORD Territory 對戰話術重點",
  "X-TRAIL 媒體報導有哪些亮點",
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
  console.log("Data Agent 快測（dataset 應為 YNM_Sales_AI_Coach_test）\n");

  for (const q of CASES) {
    const start = performance.now();
    const raw = await dataAgentChat(buildDataAgentUserPrompt(q));
    const ms = Math.round(performance.now() - start);

    console.log(`\n--- ${ms}ms ---`);
    console.log(`Q: ${q}`);
    if (!raw) {
      console.log("❌ 無回覆");
      continue;
    }
    if (looksLikeTableDump(raw)) {
      console.log("⚠ 表格輸出", raw.slice(0, 200));
      continue;
    }
    const { intro, bullets } = buildBulletReplyFromText(raw);
    if (bullets.length > 0) {
      console.log(intro || "（摘要）");
      bullets.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    } else if (isUsableReply(raw)) {
      console.log(raw.slice(0, 500));
    } else {
      console.log("⚠ 無法解析", raw.slice(0, 200));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
