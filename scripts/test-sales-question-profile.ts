/**
 * 業代問題分類器單元測試（tsx scripts/test-sales-question-profile.ts）
 */
import {
  classifySalesQuestionByRules,
  extractMentionedCompetitor,
} from "../src/lib/gemini/sales-question-profile";

type Case = {
  q: string;
  category: "own_product" | "competitor" | "sales_qa";
  competitor?: string | null;
};

const CASES: Case[] = [
  { q: "X-TRAIL 有 ProPILOT 嗎", category: "own_product" },
  { q: "TUCSON L 持有成本", category: "competitor", competitor: "TUCSON L" },
  { q: "客戶說太貴怎麼回", category: "sales_qa" },
  { q: "Territory YT 負評怎麼說", category: "competitor", competitor: "Territory" },
  { q: "8 萬公里保養多少", category: "competitor" },
  { q: "試乘邀約話術", category: "sales_qa" },
  { q: "X-TRAIL AEB 跟 RAV4 比較", category: "competitor", competitor: "RAV4" },
  { q: "X-TRAIL LV2 配備說明", category: "own_product" },
  { q: "價格優惠怎麼談", category: "sales_qa" },
  { q: "土尚 L 跟 X-TRAIL 油耗比", category: "competitor", competitor: "TUCSON L" },
  { q: "媒體報導怎麼引用", category: "own_product" },
  { q: "客戶擔心電池怎麼回", category: "sales_qa" },
  { q: "我覺得XTRAIL後座椅子短不太好坐", category: "sales_qa" },
];

let failed = 0;

for (const tc of CASES) {
  const profile = classifySalesQuestionByRules(tc.q);
  const okCat = profile.category === tc.category;
  const rival = extractMentionedCompetitor(tc.q);
  const okRival =
    tc.competitor === undefined ||
    tc.competitor === null ||
    profile.mentionedCompetitor === tc.competitor ||
    rival === tc.competitor;

  if (!okCat || !okRival) {
    failed += 1;
    console.error("FAIL", tc.q);
    console.error("  expected", tc.category, tc.competitor ?? "-");
    console.error("  got", profile.category, profile.mentionedCompetitor ?? "-");
  } else {
    console.log("OK", tc.category, tc.q.slice(0, 32));
  }
}

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}

console.log(`\nAll ${CASES.length} cases passed.`);
