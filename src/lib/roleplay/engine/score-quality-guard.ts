import {
  detectCorrectionCandidates,
  isWeakAgentReply,
} from "@/lib/roleplay/engine/correction-builder";
import { clampScore, scoreToGrade } from "@/lib/roleplay/engine/grade-mapper";
import { coalesceAdjacentAgentTurns } from "@/lib/roleplay/engine/turn-coalesce";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import type { RoleplayChatTurn, RoleplayScoreResult } from "@/lib/roleplay/session-types";

const DIMENSION_MAX = 20;

/** 消極、敷衍、極短或明顯亂答（評分客觀校正用） */
export function isLowQualityAgentReply(agent: string): boolean {
  const t = agent.trim();
  if (!t) return true;
  if (isWeakAgentReply(t)) return true;
  if (t.length < 12) return true;
  if (
    /不知道|不確定|不太清楚|沒研究|沒辦法|不清楚|不太懂|沒有資料|隨便|再看看|應該吧|大概吧|差不多吧|問主管|回去查|晚點再說|管他|無所謂|都可以|哈哈哈|哈哈|測試|亂講|亂說|敷衍|隨便講|隨便說|不知道耶|不曉得/i.test(
      t,
    )
  ) {
    return true;
  }
  if (t.length < 22 && !/\d|WLTC|試算|試乘|隔音|油耗|km|萬|配備|功能|加總|折扣/.test(t)) {
    return true;
  }
  return false;
}

function countSubstantiveWeakPairs(turns: RoleplayChatTurn[]): { weak: number; total: number } {
  const coalesced = coalesceAdjacentAgentTurns(turns);
  let weak = 0;
  let total = 0;
  for (let i = 0; i < coalesced.length - 1; i++) {
    const c = coalesced[i]!;
    const a = coalesced[i + 1]!;
    if (c.role !== "customer" || a.role !== "agent") continue;
    if (c.content.trim().length < 10) continue;
    total++;
    if (isLowQualityAgentReply(a.content)) weak++;
  }
  return { weak, total };
}

/** 依對話客觀品質計算總分上限（防止 LLM 對敷衍／亂答給過高分） */
export function computeObjectiveScoreCap(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
  correctionCount: number,
): number {
  const agentTurns = coalesceAdjacentAgentTurns(turns).filter((t) => t.role === "agent");
  const { weak, total } = countSubstantiveWeakPairs(turns);
  const pairRatio = total > 0 ? weak / total : 0;
  const agentRatio =
    agentTurns.length > 0
      ? agentTurns.filter((t) => isLowQualityAgentReply(t.content)).length / agentTurns.length
      : 1;
  const ratio = Math.max(pairRatio, agentRatio);

  const ruleGaps = detectCorrectionCandidates(scenario, turns).length;
  const gaps = Math.max(correctionCount, ruleGaps);

  let cap = 100;
  if (ratio >= 0.75 || (weak >= 2 && gaps >= 3)) cap = 25;
  else if (ratio >= 0.55 || gaps >= 4) cap = 35;
  else if (ratio >= 0.4 || gaps >= 3) cap = 45;
  else if (ratio >= 0.25 || gaps >= 2) cap = 55;

  cap = Math.max(15, cap - Math.max(0, gaps - 1) * 4);

  if (ratio >= 0.5 && gaps >= 2) cap = Math.min(cap, 38);
  if (ratio >= 0.65) cap = Math.min(cap, 30);

  return cap;
}

export function applyObjectiveScoreCap(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
  result: RoleplayScoreResult,
): RoleplayScoreResult {
  const cap = computeObjectiveScoreCap(scenario, turns, result.correctionPoints.length);
  if (result.score <= cap) return result;

  const ratio = cap / result.score;
  const dimensions = result.dimensions.map((d) => ({
    ...d,
    score: Math.min(DIMENSION_MAX, Math.max(0, Math.round(d.score * ratio))),
  }));
  let score = clampScore(dimensions.reduce((s, x) => s + x.score, 0));
  if (score > cap) score = clampScore(cap);
  const { grade, gradeLabel, advice } = scoreToGrade(score);

  const { weak, total } = countSubstantiveWeakPairs(turns);
  const needsHonestSummary = total > 0 && weak / total >= 0.3;
  const summary = needsHonestSummary
    ? `本場有多輪回應偏消極、空泛或未正面回答客戶疑慮，分數已依對話品質校正為 ${score} 分。${
        result.correctionPoints.length > 0
          ? `另有 ${result.correctionPoints.length} 處待補強，見下方建議。`
          : ""
      }`
    : result.summary;

  return {
    ...result,
    score,
    grade,
    gradeLabel,
    advice,
    dimensions,
    summary,
  };
}
