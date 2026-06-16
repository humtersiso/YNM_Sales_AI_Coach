/**
 * inactive 車款（KICKS）阻擋邏輯
 * npx tsx scripts/test-inactive-product-guard.ts
 */
import { assessSalesQueryAnswerability } from "../src/lib/gemini/query-relevance-guard";
import {
  detectInactiveProductLine,
  isCrossOwnProductLineComparison,
  resolveInactiveProductBlock,
} from "../src/lib/gemini/inactive-product-guard";

const q = "KICKS 跟 X-TRAIL 都有輕油電，配備差在哪裡？";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(detectInactiveProductLine(q, { productLine: "xtrail-ice" }) === "KICKS", "應偵測 KICKS");
assert(isCrossOwnProductLineComparison(q), "應為跨車系比較題");

const blocked = resolveInactiveProductBlock(q, { productLine: "xtrail-ice" });
assert(Boolean(blocked?.includes("KICKS")), `應回傳阻擋文案：${blocked}`);
assert(blocked!.includes("比較"), "比較題應說明無法比較");

const guard = assessSalesQueryAnswerability(q, [
  {
    index: 1,
    question: "X-TRAIL 媒體",
    script: "X-TRAIL 雙層隔音玻璃與鋁合金車體。",
  },
]);
assert(!guard.ok, "有 X-TRAIL 引用仍應拒答");
assert(guard.userReply?.includes("KICKS") ?? false, "拒答須點名 KICKS");

console.log("test-inactive-product-guard: 通過");
