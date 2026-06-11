import { CORRECTION_RUBRIC_VERSION } from "@/lib/roleplay/engine/correction-version";
import { buildSessionCorrections } from "@/lib/roleplay/engine/correction-builder";
import { computeDimensionScores } from "@/lib/roleplay/engine/dimension-scorer";
import { clampScore, scoreToGrade } from "@/lib/roleplay/engine/grade-mapper";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import type {
  RoleplayChatTurn,
  RoleplayCorrectionPoint,
  RoleplayScoreResult,
} from "@/lib/roleplay/session-types";

function toLegacyUnused(correctionPoints: RoleplayCorrectionPoint[]): string[] {
  return correctionPoints.map((c) => c.issue).slice(0, 5);
}

function buildSummary(
  dimensions: RoleplayScoreResult["dimensions"],
  correctionPoints: RoleplayCorrectionPoint[],
  score: number,
): string {
  const weakDimCount = dimensions.filter((d) => d.score <= 6).length;
  const isPoorSession = score <= 45 || weakDimCount >= 3;

  if (isPoorSession) {
    const gapPart =
      correctionPoints.length > 0
        ? `以下 ${correctionPoints.length} 處建議補強。`
        : "請參考教材，避免以「不清楚」或敷衍帶過客戶疑慮。";
    return `本場多輪回應不足或未能回答客戶重點，整體表現待加強。${gapPart}`;
  }

  const topDims = [...dimensions].sort((a, b) => b.score - a.score).slice(0, 2);
  const strengthLabels = topDims
    .filter((d) => d.score >= 14)
    .map((d) => d.label)
    .slice(0, 2);

  const strengthPart =
    strengthLabels.length > 0
      ? `本場在${strengthLabels.join("、")}表現較好。`
      : "本場已完成對話回應。";

  const gapPart =
    correctionPoints.length > 0
      ? `以下 ${correctionPoints.length} 處為客戶有問到、可再精準補強。`
      : score >= 60
        ? "客戶疑慮皆有回應到，表現穩定。"
        : "部分疑慮尚可再精準回應，建議補強數據說明。";

  return `${strengthPart}${gapPart}`;
}

async function buildScoreResult(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): Promise<RoleplayScoreResult> {
  const { dimensions, total } = computeDimensionScores(scenario, turns);
  const score = clampScore(total);
  const { grade, gradeLabel, advice } = scoreToGrade(score);
  const correctionPoints = await buildSessionCorrections(scenario, turns);

  return {
    score,
    grade,
    gradeLabel,
    advice,
    summary: buildSummary(dimensions, correctionPoints, score),
    dimensions,
    correctionPoints,
    rubricVersion: CORRECTION_RUBRIC_VERSION,
    improvementTips: [],
    unusedStrategies: toLegacyUnused(correctionPoints),
    previousScore: null,
    scoreDelta: null,
  };
}

/** 舊場次重新產出修正點（依對話紀錄） */
export async function enrichScoreResult(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
  _result: RoleplayScoreResult,
): Promise<RoleplayScoreResult> {
  return buildScoreResult(scenario, turns);
}

export async function scoreRoleplaySession(input: {
  scenario: RoleplayScenario;
  turns: RoleplayChatTurn[];
}): Promise<RoleplayScoreResult> {
  return buildScoreResult(input.scenario, input.turns);
}
