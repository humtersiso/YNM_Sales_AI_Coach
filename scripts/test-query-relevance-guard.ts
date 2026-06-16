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
  {
    name: "問 CR-V 成本卻只有 RAV4 試算",
    message:
      "考慮 X-TRAIL ICE 同時看 Honda CR-V，長期保養油耗差多少？",
    citations: [
      {
        index: 1,
        question: "X-TRAIL vs RAV4 持有成本",
        script:
          "若以 10 年 10 萬公里為基準，X-TRAIL 旗艦版與 RAV4 相比，在車價、稅金、油資及電池等總費用上，X-TRAIL 能省下近 30 萬元。",
      },
      {
        index: 2,
        question: "X-TRAIL ICE 規格",
        script: "1.5T VC-TURBO 最大馬力 204ps，平均油耗 16.0 km/L",
      },
    ],
    expectOk: false,
  },
  {
    name: "KICKS vs X-TRAIL 比較（KICKS 題庫未建）",
    message: "KICKS 跟 X-TRAIL 都有輕油電，配備差在哪裡？",
    citations: [
      {
        index: 1,
        question: "X-TRAIL 媒體報導",
        script: "X-TRAIL 全車系標配雙層隔音玻璃，車體大量採用鋁合金材質。",
      },
      {
        index: 2,
        question: "競品AEB比較表",
        script: "X-TRAIL ICE 與 CR-V 的 AEB 比較",
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
