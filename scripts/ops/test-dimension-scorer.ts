/**
 * 五維規則評分 — 三場對照
 * npx tsx scripts/ops/test-dimension-scorer.ts
 */
import assert from "node:assert/strict";
import { detectCorrectionCandidates } from "../../src/lib/roleplay/engine/correction-builder";
import {
  computeDimensionScores,
  STRICT_SCORE_CAP,
} from "../../src/lib/roleplay/engine/dimension-scorer";
import { DEMO_ROLEPLAY_SCENARIOS } from "../../src/lib/roleplay/seed/demo-scenarios";
import type { RoleplayScenario } from "../../src/lib/roleplay/scenario-contract";
import type { RoleplayChatTurn } from "../../src/lib/roleplay/session-types";

const scenario: RoleplayScenario = {
  ...DEMO_ROLEPLAY_SCENARIOS[0]!,
  sectionE: { ...DEMO_ROLEPLAY_SCENARIOS[0]!.sectionE, maxTurns: 5 },
};

function printSession(name: string, turns: RoleplayChatTurn[], min: number, max: number) {
  const { dimensions, total: score } = computeDimensionScores(scenario, turns);
  console.log(`\n=== ${name} ===`);
  console.log(`總分：${score}`);
  for (const d of dimensions) {
    console.log(`  ${d.label}：${d.score} — ${d.comment}`);
  }
  assert.ok(score >= min && score <= max, `${name}: expected ${min}-${max}, got ${score}`);
  return score;
}

/** A. 答非所問嚴重場（目標 ~60） */
const sessionA: RoleplayChatTurn[] = [
  { role: "agent", content: "您好，在看這台車嗎？有什麼想了解的都可以問我喔！", at: "1" },
  {
    role: "customer",
    content:
      "你好，我最近剛好在看休旅車，RAV4 跟 X-TRAIL 都在考慮，網路上都說 RAV4 油耗比較漂亮，十年十萬公里持有成本怎麼算？",
    at: "2",
  },
  {
    role: "agent",
    content:
      "我非常理解您在意長期持有成本與油耗，這確實很關鍵。其實數據往往僅供參考，實際駕駛感受才是最準確的，建議您今天安排試乘，我們現場為您分析。",
    at: "3",
  },
  {
    role: "customer",
    content: "試乘我之後會考慮，但能不能直接給我試算標準，把十年持有成本邏輯講清楚？",
    at: "4",
  },
  {
    role: "agent",
    content:
      "關於 30 萬的差距我可以提供您試算表，我們的車是雙層玻璃，時速 50 公里下可以少 3 分貝，實際情況還是要您試乘體驗比較準確。",
    at: "5",
  },
  {
    role: "customer",
    content: "既然提到空間，RAV4 後座比較中規中矩，你們空間變化性具體有什麼差異？",
    at: "6",
  },
  {
    role: "agent",
    content:
      "我理解您為家庭選車很重視空間與安全。數據往往僅供參考，建議安排試乘親自體驗後座與空間變化。",
    at: "7",
  },
  {
    role: "customer",
    content: "RAV4 冷氣整合在螢幕很難盲操作，你們實體按鍵怎麼設計？",
    at: "8",
  },
  {
    role: "agent",
    content: "X-TRAIL 採用按鈕式冷氣控制，駕駛時較不需低頭看螢幕，操作上比較安全。",
    at: "9",
  },
  {
    role: "customer",
    content: "高速下的風切聲才是重點，你們 3 分貝體感在高速會差多少？",
    at: "10",
  },
  {
    role: "agent",
    content: "時速 50 公里約 3 分貝差異，高速一定會更明顯，建議試乘實際感受，週六方便嗎？",
    at: "11",
  },
  {
    role: "agent",
    content: "今天感謝您的時間，有任何問題歡迎再聯絡，也方便安排試乘體驗。",
    at: "12",
  },
];

/** B. 多數有答有試算（目標 ~70） */
const sessionB: RoleplayChatTurn[] = [
  { role: "agent", content: "您好，在看這台車嗎？有什麼想了解的都可以問我喔！", at: "1" },
  {
    role: "customer",
    content: "想聽聽你怎麼分析 RAV4 跟 X-TRAIL 長遠養車成本差異？",
    at: "2",
  },
  {
    role: "agent",
    content:
      "我非常理解您在意長期持有成本與油耗。以十年十萬公里，RAV4 旗艦養車成本約 41.1 萬元，X-TRAIL 旗艦約 33.1 萬元，加車價折扣總價差可達 30 萬元，8 萬差在定保與耗材。",
    at: "3",
  },
  {
    role: "customer",
    content: "油價基準怎麼算？市區塞車油錢差距會不會拉開？",
    at: "4",
  },
  {
    role: "agent",
    content:
      "RAV4 油耗確實好一些，市區塞車差不了多少，若加上車價、折扣、電池更換費用，整體仍比 RAV4 更省。",
    at: "5",
  },
  {
    role: "customer",
    content: "電池費用是指 RAV4 油電過保維護嗎？座椅長途會比 RAV4 舒服嗎？",
    at: "6",
  },
  {
    role: "agent",
    content:
      "RAV4 後座空間變化性不如 X-TRAIL，我們後座更靈活可調，家人長途更舒適，椅背角度也較大。",
    at: "7",
  },
  {
    role: "customer",
    content: "高速隔音呢？雙層玻璃比 RAV4 單層實際差多少分貝？",
    at: "8",
  },
  {
    role: "agent",
    content: "我們是雙層玻璃，時速 50 公里約少 3 分貝，高速公路一定會更明顯，建議試乘體驗。",
    at: "9",
  },
  {
    role: "customer",
    content: "高速下具體多少分貝？不要模糊說法。",
    at: "10",
  },
  {
    role: "agent",
    content: "測試場景在 50 km/h 是 3 分貝，其他情境不會一一測試，但相信雙層一定比單層好。",
    at: "11",
  },
  {
    role: "customer",
    content: "盲操介面呢？RAV4 觸控冷氣不好盲操作，你們實體旋鈕設計如何？",
    at: "12",
  },
  {
    role: "agent",
    content:
      "X-TRAIL 保留下實體旋鈕，駕駛時可盲操調整，減少視線離開路面，許多車主喜歡這設計，歡迎試乘體驗。",
    at: "13",
  },
  {
    role: "customer",
    content: "能把車價、稅金、保養、油耗十年總成本試算給我嗎？",
    at: "14",
  },
  {
    role: "agent",
    content: "以十年十萬公里：車價跟折扣差約 21 萬、稅金約 10 萬、電池費用約 3 萬，加總約 30 幾萬。",
    at: "15",
  },
  {
    role: "customer",
    content: "試算表可以帶回去跟家人討論，有需要再聯絡。",
    at: "16",
  },
  {
    role: "agent",
    content: "今天感謝您的時間，有任何問題歡迎再聯絡，也方便安排試乘體驗。",
    at: "17",
  },
];

/** C. 全亂答（目標 20-40） */
const sessionC: RoleplayChatTurn[] = [
  { role: "customer", content: "油耗跟 Tucson 比起來怎樣？", at: "1" },
  { role: "agent", content: "不清楚耶", at: "2" },
  { role: "customer", content: "那隔音呢？玻璃有差嗎？", at: "3" },
  { role: "agent", content: "不知道，試乘再說", at: "4" },
  { role: "customer", content: "十年持有成本你怎麼估？", at: "5" },
  { role: "agent", content: "隨便啦快點約試乘", at: "6" },
];

/** D. 全場「不知道」（目標 15-40，且須有待加強候選） */
const sessionD: RoleplayChatTurn[] = [
  { role: "agent", content: "您好，在看這台車嗎？有什麼想了解的都可以問我喔！", at: "1" },
  {
    role: "customer",
    content: "你好，RAV4 跟 X-TRAIL 油耗差多少？十年十萬公里持有成本怎麼估？",
    at: "2",
  },
  { role: "agent", content: "不知道", at: "3" },
  { role: "customer", content: "那隔音呢？雙層玻璃跟 RAV4 差幾分貝？", at: "4" },
  { role: "agent", content: "不知道", at: "5" },
  { role: "customer", content: "冷氣盲操你們實體按鍵怎麼設計？", at: "6" },
  { role: "agent", content: "不知道", at: "7" },
  { role: "customer", content: "保養回廠一次大概多少？", at: "8" },
  { role: "agent", content: "不知道", at: "9" },
  { role: "agent", content: "今天感謝您的時間，有任何問題歡迎再聯絡。", at: "10" },
];

printSession("A 答非所問嚴重場", sessionA, 58, STRICT_SCORE_CAP);
const sessionACandidates = detectCorrectionCandidates(scenario, sessionA);
assert.ok(
  sessionACandidates.some((c) => /答非所問/.test(c.issue)),
  "A: 規則待加強應含答非所問",
);
console.log(`  待加強（規則）: ${sessionACandidates.length} 項，含答非所問`);
for (const c of sessionACandidates) {
  console.log(`    ${c.issue}`);
}
printSession("B 多數有答有試算", sessionB, 70, 96);
printSession("C 全亂答", sessionC, 18, 45);
printSession("D 全場不知道", sessionD, 18, 45);

const dCandidates = detectCorrectionCandidates(scenario, sessionD);
assert.ok(dCandidates.length >= 1, `D: expected correction candidates, got ${dCandidates.length}`);
console.log(`\nD 待加強候選：${dCandidates.length} 筆`);

/** E. 比錯競品（RAV4 場次卻用 Sportage 數據）→ 總分 cap 72 */
const sessionE: RoleplayChatTurn[] = [
  {
    role: "customer",
    content: "我在比 X-TRAIL ICE 跟 RAV4，RAV4 回廠定保一次大概多少？",
    at: "1",
  },
  {
    role: "agent",
    content:
      "SPORTAGE 回廠保養每次約 1～2 萬元，X-TRAIL 只要 2～5 千元，十年加總差很多。",
    at: "2",
  },
  {
    role: "customer",
    content: "我問的是 RAV4，不是 Sportage，能針對 RAV4 說明嗎？",
    at: "3",
  },
  {
    role: "agent",
    content:
      "以十年 10 萬公里試算，車價稅金油資加總，X-TRAIL 比 RAV4 省約 15 萬，定保約 2～5 千元。",
    at: "4",
  },
];
const eResult = computeDimensionScores(scenario, sessionE);
assert.ok(eResult.strictScoreCapped, "E: 比錯競品應觸發總分上限");
assert.ok(eResult.total <= STRICT_SCORE_CAP, `E: 總分應 ≤${STRICT_SCORE_CAP}，實際 ${eResult.total}`);
console.log(`\n=== E 比錯競品 cap ===\n總分：${eResult.total}（capped=${eResult.strictScoreCapped}）`);

/** F. 問隔音卻灌試算數字：分數應低於貼題回答 */
const sessionFOffTopic: RoleplayChatTurn[] = [
  {
    role: "customer",
    content: "RAV4 跟 X-TRAIL 的隔音跟玻璃厚度，教材有分貝數據嗎？",
    at: "1",
  },
  {
    role: "agent",
    content:
      "十年 10 萬公里試算，車價稅金油資加總 X-TRAIL 比 RAV4 省約 30 萬，WLTC 綜合油耗約 16 km/L，定保 2～5 千元，電池費用也一併算進去。",
    at: "2",
  },
];
const sessionFOnTopic: RoleplayChatTurn[] = [
  {
    role: "customer",
    content: "RAV4 跟 X-TRAIL 的隔音跟玻璃厚度，教材有分貝數據嗎？",
    at: "1",
  },
  {
    role: "agent",
    content:
      "X-TRAIL 雙層隔音玻璃約 35 分貝，RAV4 約 38 分貝，時速 50 公里實測差約 3 分貝。",
    at: "2",
  },
];
const fOff = computeDimensionScores(scenario, sessionFOffTopic);
const fOn = computeDimensionScores(scenario, sessionFOnTopic);
assert.ok(
  fOff.total < fOn.total,
  `F: 答非所問灌水應低於貼題回答（${fOff.total} vs ${fOn.total}）`,
);
assert.ok(
  fOff.dimensions.find((d) => d.dimensionId === "factCheck")!.score <
    fOn.dimensions.find((d) => d.dimensionId === "factCheck")!.score,
  "F: 事實維度應因答非所問而較低",
);
console.log(`\n=== F 灌水 vs 貼題 ===\n灌水：${fOff.total}，貼題：${fOn.total}`);

/** G. 同一內容下，maxTurns=7 應比 maxTurns=5 更嚴格（事實維度分母要跟輪數走） */
const scenario7: RoleplayScenario = {
  ...scenario,
  sectionE: { ...scenario.sectionE, maxTurns: 7 },
};
const g5 = computeDimensionScores(scenario, sessionFOnTopic);
const g7 = computeDimensionScores(scenario7, sessionFOnTopic);
assert.ok(
  g7.dimensions.find((d) => d.dimensionId === "factCheck")!.score <
    g5.dimensions.find((d) => d.dimensionId === "factCheck")!.score,
  "G: maxTurns=7 的事實維度應低於 maxTurns=5（同樣強事實輪次）",
);
console.log(
  `\n=== G 輪數分母檢查 ===\nmaxTurns=5 factCheck=${g5.dimensions.find((d) => d.dimensionId === "factCheck")!.score}，maxTurns=7 factCheck=${g7.dimensions.find((d) => d.dimensionId === "factCheck")!.score}`,
);

console.log("\ntest-dimension-scorer: OK");
