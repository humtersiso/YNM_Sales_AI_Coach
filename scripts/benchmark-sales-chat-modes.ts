/**
 * 四模式對照：Function Calling / Data Agent / Hybrid / BQ-fast
 * 用法：npx tsx scripts/benchmark-sales-chat-modes.ts
 *       npx tsx scripts/benchmark-sales-chat-modes.ts --modes=function-calling,data-agent,hybrid,bq-fast
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataAgentChat } from "../src/lib/gemini/gemini-client";
import { looksLikeTableDump, summarizeCitationsWithGemini } from "../src/lib/gemini/gemini-summarize";
import { buildKnowledgeReply } from "../src/lib/gemini/knowledge-reply";
import { searchKnowledgeCitations } from "../src/lib/gemini/knowledge-search";
import {
  buildBulletReplyFromText,
  isUsableReply,
  notInQuestionBankMessage,
} from "../src/lib/gemini/reply-format";
import { buildDataAgentUserPrompt } from "../src/lib/gemini/sales-reply-directives";
import { chatWithSalesAgent } from "../src/lib/gemini/sales-agent-orchestrator";
import type { MaterialCategory } from "../src/lib/ingest/contracts/material-category-contract";
import type { KnowledgeSearchScope } from "../src/lib/knowledge/search-scope";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

type BenchMode = "function-calling" | "data-agent" | "hybrid" | "bq-fast";

const MODE_LABELS: Record<BenchMode, string> = {
  "function-calling": "Function Calling（FC 分流+BQ+摘要）",
  "data-agent": "Data Agent（Google 代管）",
  hybrid: "Hybrid（BQ+Gemini 摘要）",
  "bq-fast": "BQ-fast（本地摘要）",
};

const ALL_MODES: BenchMode[] = ["function-calling", "data-agent", "hybrid", "bq-fast"];

function normalizeBenchMode(raw: string): BenchMode | null {
  const m = raw.trim().toLowerCase();
  if (m === "function-calling" || m === "fc-agent" || m === "fc" || m === "agent") return "function-calling";
  if (m === "data-agent" || m === "analytics") return "data-agent";
  if (m === "hybrid") return "hybrid";
  if (m === "bq-fast" || m === "bq" || m === "fast") return "bq-fast";
  return null;
}

type TestCase = {
  id: string;
  question: string;
  productLine: string;
  materialCategory: MaterialCategory;
};

const CASES: TestCase[] = [
  {
    id: "1-territory-yt",
    question: "TERRITORY_YT負評影片 在哪裡? 還有相關的資訊有?",
    productLine: "xtrail-ice",
    materialCategory: "competitor_compare",
  },
  {
    id: "2-fuel",
    question: "客戶擔心 X-TRAIL 油耗怎麼回？",
    productLine: "xtrail-ice",
    materialCategory: "sales_script",
  },
  {
    id: "3-aeb",
    question: "競品 AEB 比較",
    productLine: "xtrail-ice",
    materialCategory: "product_info",
  },
  {
    id: "4-test-drive",
    question: "試乘邀約怎麼說",
    productLine: "xtrail-ice",
    materialCategory: "sales_script",
  },
  {
    id: "5-price",
    question: "價格優惠話術",
    productLine: "xtrail-ice",
    materialCategory: "sales_script",
  },
  {
    id: "6-battle",
    question: "FORD Territory 對戰話術重點",
    productLine: "xtrail-ice",
    materialCategory: "competitor_compare",
  },
  {
    id: "7-media",
    question: "X-TRAIL 媒體報導有哪些亮點",
    productLine: "xtrail-ice",
    materialCategory: "product_info",
  },
  {
    id: "8-tucson",
    question: "TUCSON 長期持有成本",
    productLine: "xtrail-ice",
    materialCategory: "competitor_compare",
  },
  {
    id: "9-pro-pilot",
    question: "ProPILOT 跟競品差在哪",
    productLine: "xtrail-ice",
    materialCategory: "competitor_compare",
  },
  {
    id: "10-nonsense",
    question: "客戶問今天天氣如何",
    productLine: "xtrail-ice",
    materialCategory: "sales_script",
  },
  {
    id: "11-epower",
    question: "e-POWER 跟傳統油電有什麼差？客戶問怎麼解釋",
    productLine: "xtrail-ice",
    materialCategory: "product_info",
  },
  {
    id: "12-soundproof",
    question: "雙層隔音玻璃有什麼好處？客戶問靜音",
    productLine: "xtrail-ice",
    materialCategory: "product_info",
  },
  {
    id: "13-crv-battle",
    question: "Honda CR-V 對戰話術",
    productLine: "xtrail-ice",
    materialCategory: "competitor_compare",
  },
  {
    id: "14-rear-seat",
    question: "客戶說 X-TRAIL 後座會晃、容易暈怎麼回",
    productLine: "xtrail-ice",
    materialCategory: "sales_script",
  },
  {
    id: "15-vct",
    question: "VC-TURBO 可變壓縮比引擎要怎麼跟客戶講",
    productLine: "xtrail-ice",
    materialCategory: "product_info",
  },
  {
    id: "16-battery",
    question: "e-POWER 電池保固幾年？客戶擔心更換費用",
    productLine: "xtrail-ice",
    materialCategory: "product_info",
  },
  {
    id: "17-rr-aeb",
    question: "X-TRAIL 有沒有後方煞車輔助？跟 KUGA 比呢",
    productLine: "xtrail-ice",
    materialCategory: "product_info",
  },
  {
    id: "18-kuga",
    question: "客戶說 KUGA 比較便宜，怎麼回",
    productLine: "xtrail-ice",
    materialCategory: "competitor_compare",
  },
];

type ModeResult = {
  mode: BenchMode;
  ms: number;
  hit: boolean;
  intro: string;
  bullets: string[];
  citationCount: number;
  topSource: string;
  flags: string[];
  error?: string;
};

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

function scopeOf(tc: TestCase): KnowledgeSearchScope {
  return { productLine: tc.productLine, materialCategory: tc.materialCategory };
}

function qualityFlags(tc: TestCase, intro: string, bullets: string[], topSource: string): string[] {
  const flags: string[] = [];
  const joined = [intro, ...bullets].join(" ");
  if (/PK\[Content|Here's the query|standard_script_idea/i.test(joined)) flags.push("表格/亂碼");
  if (/All rights reserved/i.test(joined)) flags.push("版權雜訊");
  if (tc.id === "1-territory-yt" && topSource && !/YT|負評/i.test(topSource)) flags.push("未命中YT檔");
  if (tc.id === "6-battle" && topSource && /SPORTAGE/i.test(topSource) && !/Territory|FORD/i.test(topSource)) {
    flags.push("誤中Sportage");
  }
  if (tc.id === "10-nonsense" && bullets.length > 0) flags.push("應拒答卻有內容");
  if (bullets.length === 0 && !joined.includes("題庫")) flags.push("無列點");
  if (bullets.some((b) => b.length > 220)) flags.push("列點過長");
  return flags;
}

async function runAgent(tc: TestCase): Promise<ModeResult> {
  const start = performance.now();
  try {
    const result = await chatWithSalesAgent(tc.question, {
      productLine: tc.productLine,
      materialCategory: tc.materialCategory,
    });
    const ms = Math.round(performance.now() - start);
    const topSource = result.citations[0]?.question ?? "";
    return {
      mode: "function-calling",
      ms,
      hit: result.inQuestionBank && result.bullets.length > 0,
      intro: result.reply,
      bullets: result.bullets,
      citationCount: result.citations.length,
      topSource,
      flags: qualityFlags(tc, result.reply, result.bullets, topSource),
    };
  } catch (e) {
    return {
      mode: "function-calling",
      ms: Math.round(performance.now() - start),
      hit: false,
      intro: "",
      bullets: [],
      citationCount: 0,
      topSource: "",
      flags: ["例外"],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runDataAgent(tc: TestCase): Promise<ModeResult> {
  const start = performance.now();
  const wrapped = buildDataAgentUserPrompt(tc.question);

  try {
    const raw = await dataAgentChat(wrapped);
    const ms = Math.round(performance.now() - start);
    if (!raw) {
      return {
        mode: "data-agent",
        ms,
        hit: false,
        intro: "",
        bullets: [],
        citationCount: 0,
        topSource: "",
        flags: ["Agent無回覆"],
        error: "dataAgentChat returned null",
      };
    }
    if (looksLikeTableDump(raw)) {
      return {
        mode: "data-agent",
        ms,
        hit: true,
        intro: "（表格輸出）",
        bullets: [raw.slice(0, 200) + "…"],
        citationCount: 0,
        topSource: "",
        flags: ["表格/亂碼", ...qualityFlags(tc, raw, [], "")],
      };
    }
    const parsed = buildBulletReplyFromText(raw);
    const flags = qualityFlags(tc, parsed.intro, parsed.bullets, "");
    return {
      mode: "data-agent",
      ms,
      hit: parsed.bullets.length > 0 || isUsableReply(raw),
      intro: parsed.intro || raw.slice(0, 120),
      bullets: parsed.bullets.length ? parsed.bullets : [raw.slice(0, 150)],
      citationCount: 0,
      topSource: "(Agent自查BQ)",
      flags,
    };
  } catch (e) {
    return {
      mode: "data-agent",
      ms: Math.round(performance.now() - start),
      hit: false,
      intro: "",
      bullets: [],
      citationCount: 0,
      topSource: "",
      flags: ["例外"],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runHybrid(tc: TestCase): Promise<ModeResult> {
  const start = performance.now();
  try {
    const citations = await searchKnowledgeCitations(tc.question, scopeOf(tc));
    if (citations.length === 0) {
      return {
        mode: "hybrid",
        ms: Math.round(performance.now() - start),
        hit: false,
        intro: notInQuestionBankMessage().slice(0, 80),
        bullets: [],
        citationCount: 0,
        topSource: "",
        flags: ["題庫無"],
      };
    }
    const gemini = await summarizeCitationsWithGemini(tc.question, citations);
    const ms = Math.round(performance.now() - start);
    const topSource = citations[0]?.question ?? "";
    if (gemini && gemini.bullets.length > 0) {
      const intro = gemini.intro || buildKnowledgeReply(tc.question, citations).intro;
      return {
        mode: "hybrid",
        ms,
        hit: true,
        intro,
        bullets: gemini.bullets,
        citationCount: citations.length,
        topSource,
        flags: qualityFlags(tc, intro, gemini.bullets, topSource),
      };
    }
    return {
      mode: "hybrid",
      ms,
      hit: false,
      intro: "",
      bullets: [],
      citationCount: citations.length,
      topSource,
      flags: ["Gemini摘要失敗"],
      error: "summarize returned null",
    };
  } catch (e) {
    return {
      mode: "hybrid",
      ms: Math.round(performance.now() - start),
      hit: false,
      intro: "",
      bullets: [],
      citationCount: 0,
      topSource: "",
      flags: ["例外"],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function runBqFast(tc: TestCase): Promise<ModeResult> {
  const start = performance.now();
  try {
    const citations = await searchKnowledgeCitations(tc.question, scopeOf(tc));
    if (citations.length === 0) {
      return {
        mode: "bq-fast",
        ms: Math.round(performance.now() - start),
        hit: false,
        intro: notInQuestionBankMessage().slice(0, 80),
        bullets: [],
        citationCount: 0,
        topSource: "",
        flags: ["題庫無"],
      };
    }
    const { intro, bullets, displayCitations } = buildKnowledgeReply(tc.question, citations);
    const ms = Math.round(performance.now() - start);
    const topSource = displayCitations[0]?.question ?? citations[0]?.question ?? "";
    return {
      mode: "bq-fast",
      ms,
      hit: bullets.length > 0,
      intro,
      bullets,
      citationCount: citations.length,
      topSource,
      flags: qualityFlags(tc, intro, bullets, topSource),
    };
  } catch (e) {
    return {
      mode: "bq-fast",
      ms: Math.round(performance.now() - start),
      hit: false,
      intro: "",
      bullets: [],
      citationCount: 0,
      topSource: "",
      flags: ["例外"],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

async function main() {
  loadEnv();
  const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
  const hasKey = Boolean(process.env.GEMINI_API_KEY?.trim());

  const modesArg = process.argv.find((a) => a.startsWith("--modes="));
  const modes: BenchMode[] = modesArg
    ? modesArg
        .slice("--modes=".length)
        .split(",")
        .map((m) => normalizeBenchMode(m))
        .filter((m): m is BenchMode => m !== null)
    : ALL_MODES;

  if (modes.length === 0) {
    console.error("無有效模式。可用：function-calling, data-agent, hybrid, bq-fast");
    process.exit(1);
  }

  console.log(`模型: ${model} | GEMINI_API_KEY: ${hasKey ? "已設定" : "未設定"}`);
  console.log(`題數: ${CASES.length} × ${modes.length} 模式\n`);
  for (const m of modes) console.log(`  - ${MODE_LABELS[m]}`);
  console.log();

  const all: Array<{ caseId: string; question: string; results: ModeResult[] }> = [];

  for (const tc of CASES) {
    console.log(`\n======== ${tc.id} ========`);
    console.log(`Q: ${tc.question} [${tc.materialCategory}]`);

    const results: ModeResult[] = [];
    for (const mode of modes) {
      const r =
        mode === "function-calling"
          ? await runAgent(tc)
          : mode === "data-agent"
            ? await runDataAgent(tc)
            : mode === "hybrid"
              ? await runHybrid(tc)
              : await runBqFast(tc);
      results.push(r);
      console.log(
        `\n[${r.mode}] ${r.ms}ms | 命中:${r.hit ? "Y" : "N"} | 列點:${r.bullets.length} | 來源:${r.topSource.slice(0, 50)}`,
      );
      if (r.error) console.log(`  error: ${r.error}`);
      if (r.flags.length) console.log(`  flags: ${r.flags.join("；")}`);
      if (r.hit) {
        console.log(`  ${r.intro}`);
        r.bullets.forEach((b, i) => console.log(`  ${i + 1}. ${b.slice(0, 100)}${b.length > 100 ? "…" : ""}`));
      }
    }
    all.push({ caseId: tc.id, question: tc.question, results });
  }

  const summary = {
    ranAt: new Date().toISOString(),
    model,
    hasGeminiKey: hasKey,
    byMode: {} as Record<
      BenchMode,
      { avgMs: number; hitRate: string; flagged: number; samples: number }
    >,
  };

  for (const mode of modes) {
    const flat = all.flatMap((a) => a.results.filter((r) => r.mode === mode));
    const hits = flat.filter((r) => r.hit).length;
    summary.byMode[mode] = {
      avgMs: avg(flat.map((r) => r.ms)),
      hitRate: `${hits}/${flat.length}`,
      flagged: flat.filter((r) => r.flags.length > 0).length,
      samples: flat.length,
    };
  }

  const outPath = path.join(webRoot, "data", "benchmark-sales-chat-modes.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ summary, modeLabels: MODE_LABELS, cases: all }, null, 2),
    "utf8",
  );

  const md = buildComparisonMarkdown(summary, modes, all);
  const mdPath = path.join(webRoot, "data", "benchmark-comparison.md");
  fs.writeFileSync(mdPath, md, "utf8");

  console.log("\n\n======== 總表 ========");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n完整結果: ${outPath}`);
  console.log(`比較表: ${mdPath}`);
  console.log("\n" + md);
}

function buildComparisonMarkdown(
  summary: {
    ranAt: string;
    model: string;
    byMode: Record<BenchMode, { avgMs: number; hitRate: string; flagged: number; samples: number }>;
  },
  modes: BenchMode[],
  all: Array<{ caseId: string; question: string; results: ModeResult[] }>,
): string {
  const lines: string[] = [];
  lines.push("# 銷售助手四模式比較表");
  lines.push("");
  lines.push(`- 執行時間：${summary.ranAt}`);
  lines.push(`- 模型：${summary.model}`);
  lines.push(`- 題數：${all.length}`);
  lines.push("");

  lines.push("## 總覽");
  lines.push("");
  lines.push("| 模式 | 平均耗時 | 命中率 | 品質警示題數 |");
  lines.push("|------|----------|--------|--------------|");
  for (const mode of modes) {
    const s = summary.byMode[mode];
    lines.push(`| ${MODE_LABELS[mode]} | ${(s.avgMs / 1000).toFixed(1)}s | ${s.hitRate} | ${s.flagged}/${s.samples} |`);
  }
  lines.push("");

  lines.push("## 逐題命中（Y=有列點回覆，N=無）");
  lines.push("");
  const headers = ["題號", "問題", ...modes.map((m) => MODE_LABELS[m].split("（")[0])];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  for (const row of all) {
    const cells = modes.map((mode) => {
      const r = row.results.find((x) => x.mode === mode);
      if (!r) return "-";
      const hit = r.hit ? "Y" : "N";
      const flag = r.flags.length ? `⚠` : "";
      return `${hit}${flag} (${(r.ms / 1000).toFixed(1)}s, ${r.bullets.length}點)`;
    });
    const q = row.question.length > 28 ? `${row.question.slice(0, 28)}…` : row.question;
    lines.push(`| ${row.caseId} | ${q} | ${cells.join(" | ")} |`);
  }
  lines.push("");

  lines.push("## 建議");
  lines.push("");
  lines.push("- **上線預設**：Function Calling（速度 + 可控 BQ + 抗幻覺）");
  lines.push("- **Data Agent**：僅進階查詢或離線分析（慢但覆蓋廣）");
  lines.push("- **Hybrid / BQ-fast**：對照與降級備援");
  lines.push("");

  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
