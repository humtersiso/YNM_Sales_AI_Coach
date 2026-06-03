/**
 * 比對 RAG Grounding（Console 路徑）vs 既有 retrieve→summarize 管線
 * 執行：npx tsx scripts/compare-grounded-vs-pipeline.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";
import { searchKnowledgeByPlanRag } from "../src/lib/gemini/knowledge-search-rag";
import { chatWithVertexRagGrounding } from "../src/lib/rag/vertex-rag-grounded-chat";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import { summarizeCitationsWithGemini } from "../src/lib/gemini/gemini-summarize";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
process.env.SALES_KNOWLEDGE_BACKEND = "rag";
process.env.SALES_RAG_GROUNDING_IMPL = process.env.SALES_RAG_GROUNDING_IMPL ?? "augment";

const SCOPE = { productLine: "xtrail-ice" as const };

const CASES = [
  "馬力如何",
  "X-TRAIL ICE 的馬力如何？",
  "X-TRAIL 最大扭力多少？",
  "MUFASA 比較如何",
  "為什麼你們X-TRAIL試乘起來後座都感覺很晃啊?",
];

function has204(text: string): boolean {
  return /204\s*ps|204ps|30\.6\s*kgm/i.test(text);
}

function hasShake(text: string): boolean {
  return /晃|吸震|懸吊|韌性/.test(text);
}

function preview(s: string, n = 140): string {
  return s.replace(/\s+/g, " ").slice(0, n);
}

async function pipelineAnswer(message: string) {
  const { plan, profile } = await resolveSearchPlanWithProfile(message, SCOPE);
  const citations = await searchKnowledgeByPlanRag(message, plan, profile);
  const citeBlob = citations.map((c) => `${c.question}\n${c.script}`).join("\n");
  let intro = "";
  let bullets: string[] = [];
  try {
    const gemini = await summarizeCitationsWithGemini(message, citations, profile);
    if (gemini?.bullets.length) {
      intro = gemini.intro;
      bullets = gemini.bullets;
    }
  } catch {
    /* ignore */
  }
  const ans = `${intro} ${bullets.join(" ")}`;
  return {
    citations: citations.length,
    citeHas204: has204(citeBlob),
    citeHasShake: hasShake(citeBlob),
    ansHas204: has204(ans),
    ansHasShake: hasShake(ans),
    intro: preview(intro || ans),
    topCite: preview(citations[0]?.question ?? "(none)"),
  };
}

async function groundedAnswer(message: string) {
  const { profile } = await resolveSearchPlanWithProfile(message, SCOPE);
  const g = await chatWithVertexRagGrounding(message, profile);
  const citeBlob = g.citations.map((c) => `${c.question}\n${c.script}`).join("\n");
  const ans = `${g.intro} ${g.bullets.join(" ")} ${g.rawText}`;
  return {
    model: g.model,
    chunks: g.chunkCount,
    citations: g.citations.length,
    citeHas204: has204(citeBlob),
    citeHasShake: hasShake(citeBlob),
    ansHas204: has204(ans),
    ansHasShake: hasShake(ans),
    intro: preview(g.intro),
    topCite: preview(g.citations[0]?.question ?? "(none)"),
  };
}

async function main() {
  console.log("=== Grounding vs Pipeline 比對 ===\n");
  console.log("Corpora:", [
    process.env.RAG_CORPUS_SALES_SCRIPT?.slice(-8),
    process.env.RAG_CORPUS_COMPETITOR?.slice(-8),
    process.env.RAG_CORPUS_PRODUCT?.slice(-8),
  ].join(", "));

  const rows: Array<{ q: string; winner: string }> = [];

  for (const q of CASES) {
    console.log("\n" + "─".repeat(60));
    console.log("Q:", q);
    let pipe = null as Awaited<ReturnType<typeof pipelineAnswer>> | null;
    let ground = null as Awaited<ReturnType<typeof groundedAnswer>> | null;

    try {
      pipe = await pipelineAnswer(q);
      console.log("\n[Pipeline] cites:", pipe.citations, "| 204:", pipe.ansHas204, "| 晃:", pipe.ansHasShake);
      console.log("  回答:", pipe.intro);
      console.log("  引用:", pipe.topCite);
    } catch (e) {
      console.log("\n[Pipeline] ERROR:", (e as Error).message?.slice(0, 120));
    }

    try {
      ground = await groundedAnswer(q);
      console.log("\n[Grounding]", ground.model, ground.impl ?? "", "| corpus:", ground.corpus?.slice(-8), "| chunks:", ground.chunks, "| cites:", ground.citations);
      console.log("  204:", ground.ansHas204, "| 晃:", ground.ansHasShake);
      console.log("  回答:", ground.intro);
      console.log("  引用:", ground.topCite);
    } catch (e) {
      console.log("\n[Grounding] ERROR:", (e as Error).message?.slice(0, 200));
    }

    if (pipe && ground) {
      const pScore = (pipe.ansHas204 ? 2 : 0) + (pipe.ansHasShake ? 2 : 0) + (pipe.citations > 0 ? 1 : 0);
      const gScore = (ground.ansHas204 ? 2 : 0) + (ground.ansHasShake ? 2 : 0) + (ground.citations > 0 ? 1 : 0);
      const winner = gScore > pScore ? "Grounding" : gScore < pScore ? "Pipeline" : "平手";
      rows.push({ q, winner });
      console.log("\n→ 簡評:", winner);
    }
  }

  console.log("\n\n=== 摘要 ===");
  for (const r of rows) console.log(`  ${r.q.slice(0, 30).padEnd(32)} ${r.winner}`);

  // 端到端 grounded 模式（chatWithDataAgent）
  console.log("\n=== E2E SALES_CHAT_MODE=grounded ===");
  const prev = process.env.SALES_CHAT_MODE;
  process.env.SALES_CHAT_MODE = "grounded";
  for (const q of ["馬力如何", "X-TRAIL ICE 的馬力如何？"]) {
    const r = await chatWithDataAgent(q, SCOPE);
    const ans = `${r.reply} ${r.bullets.join(" ")}`;
    console.log(`\nQ: ${q}`);
    console.log("  cites:", r.citations.length, "| 204:", has204(ans));
    console.log("  ", preview(r.reply, 160));
  }
  process.env.SALES_CHAT_MODE = prev;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
