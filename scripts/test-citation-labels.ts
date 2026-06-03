/**
 * 引用標籤單元測試
 * 用法：npx tsx scripts/test-citation-labels.ts
 */
import {
  CITATION_CONTENT_LABEL,
  CITATION_SOURCE_LABEL,
  enrichCitation,
} from "../src/lib/gemini/citation-labels";

const CASES = [
  "我覺得XTRAIL後座椅子短不太好坐",
  "X-TRAIL 媒體報導彙整_202602.pptx (slide 4)",
  "TERRITORY_YT負評影片",
];

let failed = 0;
for (const q of CASES) {
  const c = enrichCitation({ index: 1, question: q, script: "測試話術內容超過十個字元" }, "product_info");
  const ok =
    c.sourceLabel === CITATION_SOURCE_LABEL && c.scriptLabel === CITATION_CONTENT_LABEL;
  if (!ok) {
    failed += 1;
    console.error("FAIL", q.slice(0, 40), c.sourceLabel, c.scriptLabel);
  } else {
    console.log("OK", q.slice(0, 36));
  }
}

if (failed) process.exit(1);
console.log(`\nAll ${CASES.length} cases passed.`);
