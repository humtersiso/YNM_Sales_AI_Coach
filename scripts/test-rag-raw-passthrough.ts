/**
 * RAG 純檢索（retrieveContexts）五題回歸
 * 用法：npx tsx scripts/test-rag-raw-passthrough.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

process.env.SALES_KNOWLEDGE_BACKEND = "rag";
process.env.SALES_CHAT_MODE = "rag-raw";

const CASES = [
  "TUCSON L 長期持有成本",
  "我試乘時候，好像會聽到異音 這是怎麼回事",
  "XFORCE的特色",
  "XFORCE 跟 X-TRAIL 比較",
  "X-TRAIL 有哪些特色？說來聽聽",
];

async function main() {
  console.log("MODE:", process.env.SALES_CHAT_MODE, "| BACKEND:", process.env.SALES_KNOWLEDGE_BACKEND);
  console.log("=".repeat(72));

  const rows: Array<{
    q: string;
    ok: boolean;
    ms: number;
    cites: number;
    title: string;
    preview: string;
  }> = [];

  for (const q of CASES) {
    const t0 = Date.now();
    let ok = false;
    let cites = 0;
    let title = "";
    let preview = "";
    try {
      const r = await chatWithDataAgent(q, { productLine: "xtrail-ice" });
      cites = r.citations.length;
      title = r.citations[0]?.question ?? "";
      preview = r.reply.replace(/\s+/g, " ").slice(0, 200);
      ok = r.inQuestionBank && cites >= 1 && r.reply.trim().length > 0;
    } catch (e) {
      preview = e instanceof Error ? e.message.slice(0, 120) : String(e);
    }
    const ms = Date.now() - t0;
    rows.push({ q, ok, ms, cites, title, preview });
    console.log(`\nQ: ${q}`);
    console.log(`  pass=${ok} ms=${ms} cites=${cites}`);
    console.log(`  source: ${title || "(none)"}`);
    console.log(`  reply: ${preview}`);
  }

  console.log("\n" + "=".repeat(72));
  console.log("| 問題 | pass | cites | ms | 來源 |");
  console.log("|------|------|-------|-----|------|");
  for (const r of rows) {
    const shortQ = r.q.length > 24 ? `${r.q.slice(0, 22)}…` : r.q;
    console.log(`| ${shortQ} | ${r.ok ? "OK" : "FAIL"} | ${r.cites} | ${r.ms} | ${r.title.slice(0, 28) || "-"} |`);
  }
  const passed = rows.filter((r) => r.ok).length;
  console.log(`\n${passed}/${rows.length} passed`);
  if (passed < rows.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
