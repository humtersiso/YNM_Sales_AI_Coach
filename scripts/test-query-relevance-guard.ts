/**
 * 驗證可答性 guard（不需啟動 dev server）
 * 執行：npx tsx scripts/test-query-relevance-guard.ts
 */
import { assessSalesQueryAnswerability } from "../src/lib/gemini/query-relevance-guard";
import type { ScriptCitation } from "../src/lib/gemini/reply-format";

type Case = {
  name: string;
  message: string;
  citations: ScriptCitation[];
  expectOk: boolean;
};

const cases: Case[] = [
  {
    name: "UFO 黑名單（檢索前）",
    message: "UFO 01 跟  X-TRAIL的差異",
    citations: [],
    expectOk: false,
  },
  {
    name: "正常題（檢索前一律放行）",
    message: "MUFASA 比較如何",
    citations: [],
    expectOk: true,
  },
  {
    name: "無引用（檢索後）",
    message: "XTRAIL 特色如何?",
    citations: [],
    expectOk: true,
  },
  {
    name: "有 grounded 引用",
    message: "KUGA ALL NEW VS X-TRAIL",
    citations: [
      {
        index: 1,
        question: "KUGA 對戰 X-TRAIL",
        script: "KUGA 與 X-TRAIL ICE 規格對比…",
      },
    ],
    expectOk: true,
  },
  {
    name: "引用與問句無關",
    message: "ProPILOT 怎麼用",
    citations: [
      {
        index: 1,
        question: "本月購車優惠",
        script: "現金折扣與分期零利率方案說明…",
      },
    ],
    expectOk: false,
  },
];

let failed = 0;

console.log("=== assessSalesQueryAnswerability ===\n");
for (const c of cases) {
  const r = assessSalesQueryAnswerability(c.message, c.citations);
  const ok = r.ok === c.expectOk;
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${c.name}`);
  console.log(`  Q: ${c.message}`);
  console.log(`  expectOk=${c.expectOk} got=${r.ok}`);
  if (r.userReply) console.log(`  reply: ${r.userReply.slice(0, 72)}…`);
  console.log();
}

console.log(failed === 0 ? "All guard unit checks passed." : `${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
