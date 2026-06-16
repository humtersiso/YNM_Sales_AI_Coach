/**
 * 首頁記憶重點邏輯回歸
 * tsx scripts/ops/test-briefing-memory.ts
 */
import type { RoleplayCompletedDetail } from "../../src/lib/bq/roleplay-sessions-bq";
import {
  BRIEFING_DIM_LINE_MAX_CHARS,
  BRIEFING_TREND_LINE_MAX_CHARS,
  trimBriefingLine,
} from "../../src/lib/roleplay/dashboard-briefing-cache";
import {
  buildCorrectionMemoryLinesFromCorrections,
  buildFactMemoryLinesFromCorrections,
  buildStrategyAdviceFromCorrections,
  isValidCorrectionMemoryLine,
  isValidFactMemoryLine,
} from "../../src/lib/roleplay/briefing-correction-summary";
import { buildRuleDashboardBriefing } from "../../src/lib/roleplay/dashboard-briefing";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function mockSession(
  partial: Partial<RoleplayCompletedDetail> & Pick<RoleplayCompletedDetail, "correctionPoints">,
): RoleplayCompletedDetail {
  return {
    sessionId: "test",
    userId: "u",
    status: "COMPLETED",
    finishedAt: "2026-06-01T00:00:00.000Z",
    competitor: "Honda CR-V",
    targetModel: "X-TRAIL ICE",
    difficulty: "advanced",
    score: 70,
    grade: "B",
    scoreEmpathy: 15,
    scoreStructure: 15,
    scoreFactCheck: 10,
    scoreStrategy: 15,
    scoreClosing: 15,
    summary: "",
    improvementTips: [],
    unusedStrategies: [],
    ...partial,
  } as RoleplayCompletedDetail;
}

function testRejectRagNumberGarbage() {
  assert(
    !isValidFactMemoryLine("須牢記 CR-V 定保費用：4、6（請對照教材原文，答題須精確）"),
    "應拒絕 RAG 重點編號 4、6",
  );
  assert(!isValidFactMemoryLine("保費用：4、6"), "應拒絕無單位短數字");
  assert(
    isValidFactMemoryLine("須牢記：CR-V 定保約 8,000 元，X-TRAIL 約 2,000～5,000 元。"),
    "應接受具體金額句",
  );
}

function testFallbackToScenarioFacts() {
  const lines = buildFactMemoryLinesFromCorrections([
    mockSession({
      correctionPoints: [
        {
          issue: "高里程定保費用未說清楚",
          category: "fact",
          correctGuide: "重點 4 舊世代 HEV 油耗 vs. 重點 6 CR-V 定保費用說明",
          customerAsk: "保養要多少",
        },
      ],
      scenarioFacts: [
        { label: "CR-V 定保", value: "約 8,000 元／次" },
        { label: "X-TRAIL 定保", value: "約 2,000～5,000 元／次" },
      ],
    }),
  ]);
  assert(lines.length > 0, "應從 scenarioFacts 產出記憶重點");
  assert(!lines.some((l) => /4、6|重點\s*4/.test(l)), "不得含 RAG 編號");
  assert(
    lines.some((l) => /8,?000|2,?000|5,?000/.test(l)),
    `應含具體金額，實際：${lines.join(" | ")}`,
  );
}

function testGoodGuidePassesThrough() {
  const lines = buildFactMemoryLinesFromCorrections([
    mockSession({
      correctionPoints: [
        {
          issue: "定保費用比較不完整",
          category: "fact",
          correctGuide:
            "關於保養與回廠費用，CR-V 定保約 8,000 元一次，X-TRAIL 約 2,000～5,000 元。",
          customerAsk: "保養費用差多少",
        },
      ],
    }),
  ]);
  assert(lines.length === 1, "應產出一條");
  assert(/8,?000/.test(lines[0]), "應保留 8000 金額");
  assert(!/請對照/.test(lines[0]), "不得含請對照教材");
}

function testFactOnlyInMemoryLines() {
  const lines = buildCorrectionMemoryLinesFromCorrections([
    mockSession({
      correctionPoints: [
        {
          issue: "客戶要求試算卻只延後到 LINE",
          category: "strategy",
          correctGuide: "應當場用年里程試算油費，勿只說加 LINE 傳表。",
        },
        {
          issue: "定保費用比較不完整",
          category: "fact",
          correctGuide: "CR-V 定保約 8,000 元一次，X-TRAIL 約 2,000～5,000 元。",
        },
      ],
    }),
  ]);
  assert(!lines.some((l) => l.startsWith("【銷售策略】")), "記憶重點不應含銷售策略");
  assert(lines.some((l) => l.startsWith("【資訊對錯】")), "應含資訊對錯列點");
  assert(lines.every((l) => isValidCorrectionMemoryLine(l)), "每條應通過品質門檻");
}

function testStrategyNumbersInMemoryLines() {
  const guide =
    "非常抱歉剛才沒能給您專業的說明，讓您失望了。其實 X-TRAIL 除了輔助駕駛穩定，" +
    "在 10 年 10 萬公里的養車成本上，我們比 RAV4 省下約 8 萬元，且車室隔音與後座空間變化性都更優異。" +
    "希望能再給我們一次機會，讓我為您安排試乘，親自體驗這些產品優勢。";
  const lines = buildCorrectionMemoryLinesFromCorrections([
    mockSession({
      competitor: "Toyota RAV4",
      correctionPoints: [
        {
          issue: "策略執行：客戶失望離場時未回應疑慮",
          category: "strategy",
          correctGuide: guide,
          customerAsk: "你這樣一直回答不清楚，我真的很難信任你們",
        },
      ],
    }),
  ]);
  assert(lines.length > 0, "策略建議話術含合格數字時應進記憶重點");
  assert(
    lines.some((l) => /8\s*萬|10\s*年|10\s*萬/.test(l)),
    `應含養車成本數字，實際：${lines.join(" | ")}`,
  );
  assert(lines.every((l) => l.startsWith("【資訊對錯】")), "仍標為資訊對錯數字");
}

function testStrategyInAdviceLine() {
  const advice = buildStrategyAdviceFromCorrections([
    mockSession({
      correctionPoints: [
        {
          issue: "銷售策略未回應客戶疑慮即收尾",
          category: "strategy",
          correctGuide: "應先回應疑慮再邀約試乘。",
        },
        {
          issue: "面對折讓質疑僅帶過試乘",
          category: "strategy",
          correctGuide: "須正面說明折讓空間再邀約。",
        },
      ],
    }),
  ]);
  assert(advice !== "無", "應產出策略建議");
  assert(/試乘|折讓/.test(advice), `建議應含策略描述：${advice}`);
  assert(!/\d{3,}/.test(advice), "建議不應以數字記憶為主");
}

function testTrendLineNotTruncatedAt48() {
  const sample =
    "累計 22 場對練平均 44 分，近 5 場分數 15→15→41→59→94，近期狀態顯著回升。";
  const out = trimBriefingLine(sample, "fallback", BRIEFING_TREND_LINE_MAX_CHARS);
  assert(out === sample, `進步趨勢不應被 48 字截斷：${out}`);

  const rule = buildRuleDashboardBriefing({
    startedSessions: 22,
    completedSessions: 22,
    totalSessions: 22,
    overallAvg: 44,
    radarOverallAvg: 44,
    lastScore: 94,
    strongestDimensions: ["empathy"],
    weakestDimensions: ["factCheck"],
    dimensionLabels: { empathy: "同理", factCheck: "事實" },
    scoreTrend: [
      { sessionId: "a", completedAt: "", score: 15 },
      { sessionId: "b", completedAt: "", score: 15 },
      { sessionId: "c", completedAt: "", score: 41 },
      { sessionId: "d", completedAt: "", score: 59 },
      { sessionId: "e", completedAt: "", score: 94 },
    ],
    byDifficulty: [],
    dimensionAverages: {
      empathy: 16,
      structure: 14,
      factCheck: 10,
      strategy: 12,
      advance: 11,
    },
    suggestions: [],
    briefing: null,
  });
  assert(
    rule.trendLine.includes("顯著回升"),
    `規則小結應含完整走勢句：${rule.trendLine}`,
  );
}

function testDimLinesNotTruncatedAt56() {
  const sample =
    "儘管整體表現提升，但在事實引用正確性與同理承接上仍有進步空間，需加強對產品數據的精確記憶，並在回應客戶質疑時展現更多耐心與具體數據。";
  const out = trimBriefingLine(sample, "fallback", BRIEFING_DIM_LINE_MAX_CHARS);
  assert(out === sample, `待加強行不應被 56 字截斷：${out}`);
}

function testTrendLineNoCommaTrunc() {
  const overLong =
    `${"累計 22 場對練平均 44 分，近 5 場分數 15→15→41→59→94，近期狀態顯著回升，".repeat(2)}整體走勢持續向上。`;
  const out = trimBriefingLine(overLong, "規則走勢備援。", BRIEFING_TREND_LINE_MAX_CHARS);
  assert(!/[，,、]$/.test(out), `進步趨勢不應以逗號結尾：${out}`);
  assert(endsWithPeriodOrFallback(out), `應為完整句或備援：${out}`);
}

function testCommaEndingUsesFallback() {
  const incomplete =
    "累計 22 場對練平均 44 分，近 5 場分數 15→15→41→59→94，近期狀態顯著回升，";
  const out = trimBriefingLine(incomplete, "規則走勢備援。", BRIEFING_TREND_LINE_MAX_CHARS);
  assert(out === "規則走勢備援。", `逗號結尾殘句應回退備援：${out}`);
}

function endsWithPeriodOrFallback(text: string): boolean {
  return /[。！？]$/.test(text) || text === "規則走勢備援。";
}

function main() {
  testRejectRagNumberGarbage();
  testFallbackToScenarioFacts();
  testGoodGuidePassesThrough();
  testFactOnlyInMemoryLines();
  testStrategyNumbersInMemoryLines();
  testStrategyInAdviceLine();
  testTrendLineNotTruncatedAt48();
  testDimLinesNotTruncatedAt56();
  testTrendLineNoCommaTrunc();
  testCommaEndingUsesFallback();
  console.log("test-briefing-memory: 10/10 通過");
}

main();
