/**
 * RAG 純檢索完整測試 — 輸出完整 log 至 data/test-logs/
 * 用法：npx tsx scripts/test-rag-raw-full-log.ts
 *       npm run test:rag-raw:log
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
  process.env.SALES_CHAT_MODE = "rag-raw";
}

type TestCase = {
  id: string;
  category: string;
  question: string;
  note?: string;
};

/** 合併：使用者回歸、debug-citations、compare-grounded、suite 精選 */
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
    note: "魔王題：客戶弱點攻擊／網路負評",
  },
  {
    id: "qa-03",
    category: "sales_qa",
    question: "聽說 X-TRAIL 輕油電的冷氣在夏天很不冷，是真的嗎？",
    note: "魔王題：產品疑慮",
  },
  { id: "reg-06", category: "regression", question: "KICKS 跟 X-TRAIL 都有輕油電，配備差在哪裡？" },
  {
    id: "reg-07",
    category: "regression",
    question: "幫我推薦一台百萬左右、安全配備最滿的 NISSAN 休旅車。",
    note: "魔王題：多車款混淆",
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
    note: "魔王題：促銷／時效性",
  },
  {
    id: "cost-03",
    category: "cost",
    question: "旗艦版如果搭配舊換新折 5 萬，開走價是多少？",
    note: "魔王題：價格試算",
  },
  {
    id: "guard-01",
    category: "guard",
    question: "UFO 01 跟 X-TRAIL 差在哪",
    note: "rag-raw 無防呆；僅記錄是否仍回 chunk",
  },
  {
    id: "guard-02",
    category: "guard",
    question: "法拉利 SF90 跟 X-TRAIL 比怎麼回",
    note: "rag-raw 無防呆",
  },
];

function logLine(lines: string[], s = "") {
  lines.push(s);
  console.log(s);
}

async function retrievalDetail(question: string): Promise<string[]> {
  const lines: string[] = [];
  const topK = Number(process.env.RAG_RAW_TOP_K ?? "1") || 1;
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
      for (const h of hits) {
        lines.push(
          `      relevance=${h.relevance} title=${h.title.slice(0, 100)}`,
        );
        lines.push(`      snippet_preview=${h.snippet.slice(0, 160).replace(/\s+/g, " ")}…`);
      }
    } catch (e) {
      lines.push(
        `    [${c.materialCategory}] ERROR: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`,
      );
    }
  }
  return lines;
}

async function main() {
  loadEnv();

  const ts = new Date();
  const stamp =
    ts.toISOString().replace(/[:.]/g, "-").slice(0, 19) + "+0800";
  const logDir = path.join(webRoot, "data", "test-logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `rag-raw-full-${stamp}.log`);

  const out: string[] = [];
  const header = [
    "=".repeat(80),
    "RAG RAW PASSTHROUGH — FULL TEST LOG",
    `時間: ${ts.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`,
    `MODE: ${process.env.SALES_CHAT_MODE}`,
    `BACKEND: ${process.env.SALES_KNOWLEDGE_BACKEND}`,
    `RAG_RAW_TOP_K: ${process.env.RAG_RAW_TOP_K ?? "1"}`,
    `RAG_ENGINE: ${process.env.RAG_ENGINE_LOCATION ?? "asia-east1"}`,
    `案例數: ${CASES.length}`,
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

    logLine(out, "");
    logLine(out, "  --- retrieveContexts 各庫 ---");
    const retLines = await retrievalDetail(tc.question);
    retLines.forEach((l) => logLine(out, l));

    const t0 = Date.now();
    let ok = false;
    try {
      const r = await chatWithDataAgent(tc.question, { productLine: "xtrail-ice" });
      const ms = Date.now() - t0;
      ok = r.inQuestionBank && r.citations.length >= 1 && r.reply.trim().length > 0;

      logLine(out, "");
      logLine(out, `  --- chatWithDataAgent (${ms} ms) ---`);
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
      logLine(out, `  bullets: ${r.bullets.length}`);
      logLine(out, "");
      logLine(out, "  --- FULL REPLY (chunk 原文) ---");
      logLine(out, r.reply);
      logLine(out, "  --- END REPLY ---");
      logLine(out, `  PASS (有命中 chunk): ${ok ? "YES" : "NO"}`);

      summary.push({
        id: tc.id,
        ok,
        ms,
        cites: r.citations.length,
        source: r.citations[0]?.question ?? "",
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
  logLine(out, `TOTAL: ${passed}/${CASES.length} passed (有 chunk 命中)`);
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
