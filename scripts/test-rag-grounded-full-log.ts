/**
 * RAG Grounding 完整測試 — Gemini 內建 RAG 摘要 + citations
 * 用法：npx tsx scripts/test-rag-grounded-full-log.ts
 *       npm run test:rag-grounded:log
 *
 * 模式：SALES_CHAT_MODE=grounded + SALES_RAG_GROUNDING_IMPL=augment
 * （對齊 Console 單次通關：retrieve → 注入脈絡 → Gemini 生成）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import { listConfiguredRagCorpora } from "../src/lib/rag/rag-engine-config";
import { searchVertexRagCorpus } from "../src/lib/rag/vertex-rag-search";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  process.env.SALES_KNOWLEDGE_BACKEND = "rag";
  process.env.SALES_CHAT_MODE = "grounded";
  process.env.SALES_RAG_GROUNDING_IMPL = process.env.SALES_RAG_GROUNDING_IMPL ?? "augment";
  process.env.SALES_NEVER_DATA_AGENT = "true";
  // 與 deploy/cloudrun-test.env.yaml 對齊時可設：SALES_CHAT_FAST=false、勿覆寫 GEMINI_MODEL
}

type TestCase = {
  id: string;
  category: string;
  question: string;
  note?: string;
};

const CASES: TestCase[] = [
  { id: "reg-01", category: "regression", question: "TUCSON L 長期持有成本" },
  {
    id: "reg-02",
    category: "regression",
    question: "我試乘時候，好像會聽到異音 這是怎麼回事",
  },
  { id: "reg-03", category: "regression", question: "XFORCE的特色" },
  { id: "reg-04", category: "regression", question: "XFORCE 跟 X-TRAIL 比較" },
  { id: "reg-05", category: "regression", question: "X-TRAIL 有哪些特色？說來聽聽" },
  { id: "spec-01", category: "spec", question: "馬力如何" },
  { id: "spec-02", category: "spec", question: "X-TRAIL ICE 的馬力如何？" },
  { id: "spec-03", category: "spec", question: "X-TRAIL 最大扭力多少？" },
  { id: "spec-04", category: "spec", question: "X-TRAIL ICE 油耗大概多少？" },
  { id: "comp-01", category: "competitor", question: "MUFASA 比較如何" },
  {
    id: "qa-01",
    category: "sales_qa",
    question: "為什麼你們X-TRAIL試乘起來後座都感覺很晃啊?",
  },
  {
    id: "qa-02",
    category: "sales_qa",
    question: "網路上都說這台車用的三缸引擎抖動很嚴重，到底能不能買？",
    note: "魔王題：客戶弱點攻擊／網路負評，應維持官方立場、引用話術反駁",
  },
  {
    id: "qa-03",
    category: "sales_qa",
    question: "聽說 X-TRAIL 輕油電的冷氣在夏天很不冷，是真的嗎？",
    note: "魔王題：產品疑慮，勿被負面傳聞帶偏",
  },
  { id: "reg-06", category: "regression", question: "KICKS 跟 X-TRAIL 都有輕油電，配備差在哪裡？" },
  {
    id: "reg-07",
    category: "regression",
    question: "幫我推薦一台百萬左右、安全配備最滿的 NISSAN 休旅車。",
    note: "魔王題：多車款混淆，應分辨 KICKS vs X-TRAIL ICE，勿張冠李戴",
  },
  {
    id: "cost-01",
    category: "cost",
    question: "TUCSON L 長期持有成本詳細數字是？",
  },
  {
    id: "cost-02",
    category: "cost",
    question: "現在這個月買 X-TRAIL 有什麼限時優惠或好禮？",
    note: "魔王題：促銷／時效性，勿捏造未在知識庫的優惠",
  },
  {
    id: "cost-03",
    category: "cost",
    question: "旗艦版如果搭配舊換新折 5 萬，開走價是多少？",
    note: "魔王題：價格試算，應依片段數字或明確表示無最新牌價",
  },
  {
    id: "guard-01",
    category: "guard",
    question: "UFO 01 跟 X-TRAIL 差在哪",
    note: "應觸發 relevance guard 或禮貌拒答",
  },
  {
    id: "guard-02",
    category: "guard",
    question: "法拉利 SF90 跟 X-TRAIL 比怎麼回",
    note: "應觸發 relevance guard 或禮貌拒答",
  },
];

function logLine(lines: string[], s = "") {
  lines.push(s);
  console.log(s);
}

async function retrievalDetail(question: string): Promise<string[]> {
  const lines: string[] = [];
  const topK = Number(process.env.RAG_GROUNDING_TOP_K ?? "5") || 5;
  for (const c of listConfiguredRagCorpora()) {
    if (!c.ragCorpusResource.includes("/ragCorpora/")) continue;
    try {
      const hits = await searchVertexRagCorpus(
        c.ragCorpusResource,
        question,
        c.materialCategory,
        topK,
      );
      lines.push(`    [${c.materialCategory}] hits=${hits.length}`);
      for (const h of hits.slice(0, 3)) {
        lines.push(
          `      relevance=${h.relevance} title=${h.title.slice(0, 100)}`,
        );
        lines.push(`      snippet_preview=${h.snippet.slice(0, 160).replace(/\s+/g, " ")}…`);
      }
      if (hits.length > 3) lines.push(`      …另有 ${hits.length - 3} 筆`);
    } catch (e) {
      lines.push(
        `    [${c.materialCategory}] ERROR: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`,
      );
    }
  }
  return lines;
}

function formatReply(r: Awaited<ReturnType<typeof chatWithDataAgent>>): string {
  const parts: string[] = [];
  if (r.reply.trim()) parts.push(r.reply.trim());
  if (r.bullets.length > 0) {
    parts.push("");
    parts.push("--- 條列 ---");
    for (const b of r.bullets) parts.push(`• ${b}`);
  }
  return parts.join("\n");
}

async function main() {
  loadEnv();

  const verbose = process.argv.includes("--verbose");
  const ts = new Date();
  const stamp =
    ts.toISOString().replace(/[:.]/g, "-").slice(0, 19) + "+0800";
  const logDir = path.join(webRoot, "data", "test-logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `grounded-full-${stamp}.log`);

  const out: string[] = [];
  const header = [
    "=".repeat(80),
    "RAG GROUNDING — FULL TEST LOG（Gemini 摘要 + citations）",
    `時間: ${ts.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`,
    `MODE: ${process.env.SALES_CHAT_MODE}`,
    `GROUNDING_IMPL: ${process.env.SALES_RAG_GROUNDING_IMPL}`,
    `BACKEND: ${process.env.SALES_KNOWLEDGE_BACKEND}`,
    `RAG_GROUNDING_TOP_K: ${process.env.RAG_GROUNDING_TOP_K ?? "12"}`,
    `RAG_ENGINE: ${process.env.RAG_ENGINE_LOCATION ?? "asia-east1"}`,
    `案例數: ${CASES.length}`,
    "說明: 【系統回覆】= Gemini 生成；retrieveContexts 區塊僅供診斷（加 --verbose 顯示）",
    "=".repeat(80),
  ];
  header.forEach((l) => logLine(out, l));

  let passed = 0;
  const summary: Array<{ id: string; ok: boolean; ms: number; cites: number; source: string }> =
    [];

  for (const tc of CASES) {
    logLine(out, "");
    logLine(out, "-".repeat(80));
    logLine(out, `[${tc.id}] category=${tc.category}`);
    logLine(out, `Q: ${tc.question}`);
    if (tc.note) logLine(out, `NOTE: ${tc.note}`);

    if (verbose) {
      logLine(out, "");
      logLine(out, "  --- retrieveContexts 各庫（診斷用，非回答）---");
      const retLines = await retrievalDetail(tc.question);
      retLines.forEach((l) => logLine(out, l));
    }

    const t0 = Date.now();
    let ok = false;
    try {
      const r = await chatWithDataAgent(tc.question, { productLine: "xtrail-ice" });
      const ms = Date.now() - t0;
      ok = r.inQuestionBank && r.reply.trim().length > 0;

      logLine(out, "");
      logLine(out, `  --- 引用來源 (${ms} ms) ---`);
      logLine(out, `  inQuestionBank: ${r.inQuestionBank}`);
      logLine(out, `  citations: ${r.citations.length}`);
      for (const c of r.citations) {
        logLine(out, `    [${c.id}] ${c.title}`);
        logLine(out, `        page: ${c.page ?? "-"}`);
        logLine(
          out,
          `        excerpt: ${(c.excerpt ?? "").slice(0, 120).replace(/\s+/g, " ")}${(c.excerpt?.length ?? 0) > 120 ? "…" : ""}`,
        );
      }

      logLine(out, "");
      logLine(out, "  --- 【系統回覆】（Gemini + RAG Grounding）---");
      logLine(out, formatReply(r));
      logLine(out, "  --- END REPLY ---");
      logLine(out, `  PASS (有生成回答): ${ok ? "YES" : "NO"}`);

      summary.push({
        id: tc.id,
        ok,
        ms,
        cites: r.citations.length,
        source: r.citations[0]?.title ?? "",
      });
      if (ok) passed += 1;
    } catch (e) {
      const ms = Date.now() - t0;
      logLine(out, `  ERROR (${ms} ms): ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
      summary.push({ id: tc.id, ok: false, ms, cites: 0, source: "" });
    }
  }

  logLine(out, "");
  logLine(out, "=".repeat(80));
  logLine(out, "SUMMARY");
  logLine(out, "| id | pass | ms | cites | source |");
  logLine(out, "|----|------|-----|-------|--------|");
  for (const s of summary) {
    logLine(
      out,
      `| ${s.id} | ${s.ok ? "OK" : "FAIL"} | ${s.ms} | ${s.cites} | ${s.source.slice(0, 40)} |`,
    );
  }
  logLine(out, "");
  logLine(out, `TOTAL: ${passed}/${CASES.length} passed (有 Gemini 回答)`);
  logLine(out, `LOG FILE: ${logPath}`);
  logLine(out, "=".repeat(80));

  fs.writeFileSync(logPath, out.join("\n"), "utf8");
  console.log(`\n已寫入: ${logPath}`);

  if (passed < CASES.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
