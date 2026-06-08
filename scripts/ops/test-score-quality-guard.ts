/**
 * 敷衍／亂答場次不得高分
 * npx tsx scripts/ops/test-score-quality-guard.ts
 */
import assert from "node:assert/strict";
import {
  applyObjectiveScoreCap,
  computeObjectiveScoreCap,
  isLowQualityAgentReply,
} from "../../src/lib/roleplay/engine/score-quality-guard";
import type { RoleplayScenario } from "../../src/lib/roleplay/scenario-contract";
import type { RoleplayChatTurn, RoleplayScoreResult } from "../../src/lib/roleplay/session-types";

const scenario = {
  sectionC: { facts: [{ label: "WLTC", value: "16.1 km/L" }] },
} as RoleplayScenario;

const garbageTurns: RoleplayChatTurn[] = [
  { role: "customer", content: "油耗跟 Tucson 比起來怎樣？", at: "1" },
  { role: "agent", content: "不清楚耶", at: "2" },
  { role: "customer", content: "那隔音呢？玻璃有差嗎？", at: "3" },
  { role: "agent", content: "不知道，試乘再說", at: "4" },
  { role: "customer", content: "十年持有成本你怎麼估？", at: "5" },
  { role: "agent", content: "隨便啦快點約試乘", at: "6" },
];

assert.equal(isLowQualityAgentReply("不清楚耶"), true);
assert.equal(isLowQualityAgentReply("隨便啦快點約試乘"), true);

const cap = computeObjectiveScoreCap(scenario, garbageTurns, 4);
assert.ok(cap <= 35, `cap should be low, got ${cap}`);

const inflated: RoleplayScoreResult = {
  score: 77,
  grade: "B",
  gradeLabel: "良好",
  advice: "—",
  summary: "表現穩定",
  dimensions: [
    { dimensionId: "empathy", label: "同理", score: 16, maxScore: 20, comment: "" },
    { dimensionId: "structure", label: "結構", score: 15, maxScore: 20, comment: "" },
    { dimensionId: "factCheck", label: "事實", score: 15, maxScore: 20, comment: "" },
    { dimensionId: "strategy", label: "策略", score: 16, maxScore: 20, comment: "" },
    { dimensionId: "advance", label: "推進", score: 15, maxScore: 20, comment: "" },
  ],
  correctionPoints: [
    {
      category: "fact",
      issue: "未說明油耗",
      correctGuide: "應說明 WLTC 16.1 km/L 並比較十年油資。",
    },
    {
      category: "strategy",
      issue: "未回應隔音",
      correctGuide: "應說明雙層隔音玻璃差異。",
    },
    {
      category: "fact",
      issue: "未說明試算",
      correctGuide: "應列出十年持有成本項目。",
    },
    {
      category: "strategy",
      issue: "邀約過於敷衍",
      correctGuide: "應先回應疑慮再邀試乘。",
    },
  ],
  improvementTips: [],
  unusedStrategies: [],
  previousScore: null,
  scoreDelta: null,
};

const adjusted = applyObjectiveScoreCap(scenario, garbageTurns, inflated);
assert.ok(adjusted.score <= 35, `77 garbage session should cap, got ${adjusted.score}`);
assert.ok(adjusted.score < 50, `should not pass, got ${adjusted.score}`);

console.log("test-score-quality-guard: OK", { cap, adjustedScore: adjusted.score });
