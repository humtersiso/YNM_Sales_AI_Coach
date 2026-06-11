/**
 * 首頁記憶重點邏輯回歸
 * tsx scripts/ops/test-briefing-memory.ts
 */
import type { RoleplayCompletedDetail } from "../../src/lib/bq/roleplay-sessions-bq";
import {
  buildCorrectionMemoryLinesFromCorrections,
  buildFactMemoryLinesFromCorrections,
  isValidCorrectionMemoryLine,
  isValidFactMemoryLine,
} from "../../src/lib/roleplay/briefing-correction-summary";

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

function testStrategyInMemoryLines() {
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
  assert(lines.some((l) => l.startsWith("【銷售策略】")), "應含銷售策略列點");
  assert(lines.some((l) => l.startsWith("【資訊對錯】")), "應含資訊對錯列點");
  assert(lines.every((l) => isValidCorrectionMemoryLine(l)), "每條應通過品質門檻");
}

function main() {
  testRejectRagNumberGarbage();
  testFallbackToScenarioFacts();
  testGoodGuidePassesThrough();
  testStrategyInMemoryLines();
  console.log("test-briefing-memory: 4/4 通過");
}

main();
