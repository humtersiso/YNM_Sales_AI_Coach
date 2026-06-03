/**
 * 隨機／多樣問句抽測銷售助手（檢查是否過度擬合單一題型）
 * 用法：npx tsx scripts/test-sales-chat-random.ts [--seed=42]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";
import { getBigQueryClient } from "../src/lib/bq/script-drills-insert";
import {
  getBigQueryDataset,
  getBigQueryProjectId,
  getSalesKnowledgeTableId,
} from "../src/lib/bq/knowledge-config";
import type { MaterialCategory } from "../src/lib/ingest/contracts/material-category-contract";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

type TestCase = {
  id: string;
  question: string;
  productLine: string;
  materialCategory: MaterialCategory;
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

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rnd: () => number, n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length > 0) {
    const i = Math.floor(rnd() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

const FIXED_CASES: TestCase[] = [
  {
    id: "territory-yt",
    question: "TERRITORY_YT負評影片 在哪裡? 還有相關的資訊有?",
    productLine: "xtrail-ice",
    materialCategory: "competitor_compare",
  },
  {
    id: "fuel",
    question: "客戶擔心 X-TRAIL 油耗怎麼回？",
    productLine: "xtrail-ice",
    materialCategory: "sales_script",
  },
  {
    id: "aeb",
    question: "競品 AEB 比較",
    productLine: "xtrail-ice",
    materialCategory: "product_info",
  },
  {
    id: "test-drive",
    question: "試乘邀約怎麼說",
    productLine: "xtrail-ice",
    materialCategory: "sales_script",
  },
  {
    id: "price",
    question: "價格優惠話術",
    productLine: "xtrail-ice",
    materialCategory: "sales_script",
  },
  {
    id: "pro-pilot",
    question: "ProPILOT 跟競品差在哪",
    productLine: "xtrail-ice",
    materialCategory: "competitor_compare",
  },
  {
    id: "tucson-cost",
    question: "TUCSON 長期持有成本",
    productLine: "xtrail-ice",
    materialCategory: "competitor_compare",
  },
  {
    id: "media",
    question: "X-TRAIL 媒體報導",
    productLine: "xtrail-ice",
    materialCategory: "product_info",
  },
  {
    id: "nonsense",
    question: "客戶問今天天氣如何",
    productLine: "xtrail-ice",
    materialCategory: "sales_script",
  },
  {
    id: "battle",
    question: "FORD Territory 對戰話術",
    productLine: "xtrail-ice",
    materialCategory: "competitor_compare",
  },
];

function flagIssues(result: Awaited<ReturnType<typeof chatWithDataAgent>>, tc: TestCase): string[] {
  const flags: string[] = [];
  if (!result.inQuestionBank) {
    flags.push("題庫無命中");
    return flags;
  }
  if (result.bullets.length === 0) flags.push("無列點");
  const joined = [result.reply, ...result.bullets].join(" ");
  if (/PK\[Content_Types\]|Here's the query|xmlschemas/i.test(joined)) flags.push("疑似亂碼/Agent表格");
  if (/All rights reserved/i.test(joined)) flags.push("含版權雜訊");
  if (result.bullets.some((b) => b.length < 8)) flags.push("列點過短");
  if (tc.id === "territory-yt" && !joined.includes("負評") && !joined.toLowerCase().includes("territory")) {
    flags.push("YT題未提到關鍵主題");
  }
  if (tc.id === "nonsense" && result.inQuestionBank) flags.push("應為題庫無卻命中");
  const topDoc = result.citations[0]?.question ?? "";
  if (tc.id === "territory-yt" && !topDoc.includes("YT")) flags.push("YT題未命中YT檔");
  if (tc.id === "battle" && result.inQuestionBank && !topDoc.toLowerCase().includes("對戰")) {
    flags.push("對戰題可能偏檔");
  }
  return flags;
}

async function sampleFromBq(rnd: () => number, n: number): Promise<TestCase[]> {
  const projectId = getBigQueryProjectId();
  const dataset = getBigQueryDataset();
  const tableId = getSalesKnowledgeTableId();
  if (!projectId) return [];

  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: `
      SELECT
        product_line,
        material_category,
        unit_type,
        customer_question,
        SUBSTR(standard_script_idea, 1, 80) AS script_preview
      FROM \`${projectId}.${dataset}.${tableId}\`
      WHERE product_line = 'xtrail-ice'
        AND TRIM(COALESCE(standard_script_idea, '')) != ''
        AND unit_type IN ('qa_pair', 'text_chunk', 'table_row')
        AND NOT STARTS_WITH(TRIM(standard_script_idea), 'PK')
      ORDER BY RAND()
      LIMIT ${n * 3}
    `,
  });

  type BqRow = {
    product_line: string;
    material_category: MaterialCategory;
    unit_type: string;
    customer_question: string;
    script_preview: string;
  };
  const picked = pick(rows as BqRow[], rnd, n);
  return picked.map((row, i) => {
    const r = row as BqRow;
    let q = r.customer_question?.replace(/\s*\(page \d+\)/i, "").replace(/\.pdf.*/i, "").trim();
    if (r.unit_type === "qa_pair" && q.length > 60) q = q.slice(0, 60);
    if (r.unit_type !== "qa_pair") {
      q = `關於 ${q.split(" (")[0] || "這份素材"} 的重點是什麼？`;
    }
    return {
      id: `bq-rand-${i + 1}`,
      question: q || "XTRAIL 配備",
      productLine: r.product_line || "xtrail-ice",
      materialCategory: r.material_category || "general",
    };
  });
}

async function main() {
  loadEnv();
  const seedArg = process.argv.find((a) => a.startsWith("--seed="));
  const seed = seedArg ? Number(seedArg.split("=")[1]) : Date.now() % 100000;
  const rnd = mulberry32(seed);

  const bqSamples = await sampleFromBq(rnd, 5);
  const cases = [...FIXED_CASES, ...bqSamples];

  console.log(`抽測 seed=${seed}，共 ${cases.length} 題\n`);

  const summary: {
    id: string;
    question: string;
    category: string;
    hit: boolean;
    bulletCount: number;
    topSource: string;
    flags: string[];
    replyPreview: string;
    bullets: string[];
  }[] = [];

  for (const tc of cases) {
    const result = await chatWithDataAgent(tc.question, {
      productLine: tc.productLine,
      materialCategory: tc.materialCategory,
    });
    const flags = flagIssues(result, tc);
    const topSource = result.citations[0]?.question?.slice(0, 70) ?? "-";

    summary.push({
      id: tc.id,
      question: tc.question,
      category: tc.materialCategory,
      hit: result.inQuestionBank,
      bulletCount: result.bullets.length,
      topSource,
      flags,
      replyPreview: result.reply.slice(0, 80),
      bullets: result.bullets.slice(0, 4),
    });

    console.log(`--- [${tc.id}] ${tc.materialCategory} ---`);
    console.log(`Q: ${tc.question}`);
    console.log(`命中: ${result.inQuestionBank ? "是" : "否"} | 列點: ${result.bullets.length} | 來源: ${topSource}`);
    if (result.inQuestionBank) {
      console.log(result.reply);
      result.bullets.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    } else {
      console.log(result.reply.slice(0, 120));
    }
    if (flags.length) console.log(`⚠ ${flags.join("；")}`);
    console.log("");
  }

  const hits = summary.filter((s) => s.hit).length;
  const flagged = summary.filter((s) => s.flags.length > 0).length;
  console.log("=== 摘要 ===");
  console.log(
    JSON.stringify(
      {
        seed,
        total: summary.length,
        hits,
        misses: summary.length - hits,
        flagged,
        flaggedIds: summary.filter((s) => s.flags.length).map((s) => ({ id: s.id, flags: s.flags })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
