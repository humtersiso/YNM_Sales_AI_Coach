import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-agent-orchestrator";
import { searchKnowledgeByPlanRag } from "../src/lib/gemini/knowledge-search-rag";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const Q = "為什麼你們X-TRAIL試乘起來後座都感覺很晃啊?";

function loadEnv() {
  for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function main() {
  loadEnv();
  process.env.SALES_KNOWLEDGE_BACKEND = "rag";
  const { plan, profile } = await resolveSearchPlanWithProfile(Q, { productLine: "xtrail-ice" });
  console.log("profile", profile.category, profile.confidence);
  const cites = await searchKnowledgeByPlanRag(Q, plan, profile);
  console.log("citations:", cites.length);
  for (const c of cites) {
    console.log(`\n[${c.index}] ${c.question.slice(0, 90)}`);
    console.log(" ", c.script.slice(0, 150).replace(/\s+/g, " "));
  }

  const { searchVertexRagCorpus } = await import("../src/lib/rag/vertex-rag-search");
  const { prepareRagHitForDisplay } = await import("../src/lib/rag/rag-citation-pipeline");
  const corpus = process.env.RAG_CORPUS_SALES_SCRIPT ?? "";
  console.log("\n--- raw RAG top 12 ---");
  const raw = await searchVertexRagCorpus(corpus, Q, "sales_script", 12);
  raw.forEach((h, i) => {
    const focused = prepareRagHitForDisplay(Q, h);
    console.log(`${i + 1} focused=${Boolean(focused)} ${h.title.slice(0, 75)}`);
    if (focused) console.log("  F:", focused.snippet.slice(0, 180).replace(/\s+/g, " "));
  });
}

main().catch(console.error);
