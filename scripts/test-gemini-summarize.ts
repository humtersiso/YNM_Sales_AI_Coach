import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeCitationsWithGemini } from "../src/lib/gemini/gemini-summarize";
import { searchKnowledgeCitations } from "../src/lib/gemini/knowledge-search";

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
  const citations = await searchKnowledgeCitations(message, scope);
  console.log("citations", citations.length);
  const out = await summarizeCitationsWithGemini(message, citations);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
