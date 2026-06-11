/**
 * 驗證首頁雷達五維加總與 radarOverallAvg 一致
 * npx tsx scripts/ops/test-stats-radar-consistency.ts
 */
import assert from "node:assert/strict";
import type { RoleplayCompletedDetail } from "../../src/lib/bq/roleplay-sessions-bq";
import {
  buildDashboardStatsCore,
  radarOverallFromDimensionAverages,
} from "../../src/lib/roleplay/stats-service";

function row(
  sessionId: string,
  score: number,
  dims: [number, number, number, number, number],
  finishedAt: string,
): RoleplayCompletedDetail {
  const [e, s, f, st, a] = dims;
  return {
    sessionId,
    status: "COMPLETED",
    userId: "u1",
    username: "test",
    branch: "",
    personaId: "p1",
    competitor: "Toyota RAV4",
    productLine: "x-trail",
    targetModel: "X-TRAIL",
    ageRange: "30-40",
    difficulty: "advanced",
    score,
    grade: "C",
    startedAt: finishedAt,
    finishedAt,
    scoreEmpathy: e,
    scoreStructure: s,
    scoreFactCheck: f,
    scoreStrategy: st,
    scoreClosing: a,
    summary: "",
    improvementTips: [],
    correctionPoints: [],
    unusedStrategies: [],
    scenarioFacts: [],
    factCheckComment: "",
    reportJson: null,
  };
}

const completed = [
  row("1", 80, [16, 16, 16, 16, 16], "2026-06-11T10:00:00Z"),
  row("2", 60, [12, 12, 12, 12, 12], "2026-06-10T10:00:00Z"),
  row("3", 40, [8, 8, 8, 8, 8], "2026-06-09T10:00:00Z"),
  row("4", 20, [4, 4, 4, 4, 4], "2026-06-08T10:00:00Z"),
];

const stats = buildDashboardStatsCore(completed, 4);
const avg = stats.dimensionAverages!;
const dimSum =
  (avg.empathy ?? 0) +
  (avg.structure ?? 0) +
  (avg.factCheck ?? 0) +
  (avg.strategy ?? 0) +
  (avg.advance ?? 0);

assert.equal(dimSum, stats.radarOverallAvg, `dim sum ${dimSum} vs radarOverallAvg ${stats.radarOverallAvg}`);
assert.equal(stats.radarOverallAvg, radarOverallFromDimensionAverages(avg));
assert.equal(stats.overallAvg, 50, "lifetime overallAvg unchanged");
console.log("radarOverallAvg:", stats.radarOverallAvg, "dimSum:", dimSum, "overallAvg:", stats.overallAvg);
console.log("test-stats-radar-consistency: OK");
