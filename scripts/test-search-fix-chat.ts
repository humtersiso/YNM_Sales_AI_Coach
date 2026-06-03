import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";

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

async function main() {
  loadEnv();
  const qs = ["我覺得XTRAIL後座椅子短不太好坐", "XTRAIL 特色如何?"];
  for (const q of qs) {
    console.log("\n===", q);
    const r = await chatWithDataAgent(q, {});
    console.log("inQuestionBank:", r.inQuestionBank, "allowAdd:", r.allowAddRequest);
    console.log("小結:", r.reply?.slice(0, 200));
    console.log("列點:", r.bullets?.length ?? 0);
    r.bullets?.slice(0, 3).forEach((b, i) => console.log(`  ${i + 1}. ${b.slice(0, 120)}`));
  }
}

main().catch(console.error);
