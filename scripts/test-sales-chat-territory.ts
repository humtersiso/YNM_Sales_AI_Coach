/**
 * 測試銷售助手：TERRITORY_YT 負評影片
 * 用法：npx tsx scripts/test-sales-chat-territory.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithDataAgent, searchScriptRows } from "../src/lib/gemini/conversational-analytics";

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

loadEnv();

const message = "TERRITORY_YT負評影片 在哪裡? 還有相關的資訊有?";
const scope = { productLine: "xtrail-ice", materialCategory: "competitor_compare" as const };

async function main() {
  const citations = await searchScriptRows(message, 10, scope);
  console.log("命中筆數:", citations.length);

  const result = await chatWithDataAgent(message, scope);
  console.log("\n=== 銷售助手回覆 ===");
  console.log(result.reply);
  result.bullets.forEach((b, i) => console.log(`${i + 1}. ${b}`));
  console.log("\n引用來源:", result.citations.length, "筆");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
