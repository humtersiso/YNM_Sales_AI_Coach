import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geminiGenerateText } from "../src/lib/gemini/gemini-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
// 模擬 Next.js：系統環境變數已存在時不會被 .env 覆寫
process.env.GEMINI_API_KEY = "AIzaSyEXPIRED_INVALID_KEY_FOR_TEST";
console.log("simulate stale system GEMINI_API_KEY (expired)");

async function main() {
  const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
  console.log("model:", model);
  const r = await geminiGenerateText("只回覆：測試成功", { maxOutputTokens: 32 });
  console.log("geminiGenerateText:", r ?? "(null)");
  process.exit(r ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
