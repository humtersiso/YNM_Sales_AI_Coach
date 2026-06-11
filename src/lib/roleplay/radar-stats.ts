import type { RoleplayCompletedDetail } from "@/lib/bq/roleplay-sessions-bq";
import type { RoleplayDimensionAverages } from "@/lib/roleplay/roleplay-types-api";

/** 個人首頁雷達圖與「均分」須同一批完賽場次，加總才會一致 */
export const OVERVIEW_RADAR_LAST_N = 10;

const DIMENSION_IDS = ["empathy", "structure", "factCheck", "strategy", "advance"] as const;

const DIMENSION_SCORE_KEYS = [
  "scoreEmpathy",
  "scoreStructure",
  "scoreFactCheck",
  "scoreStrategy",
  "scoreClosing",
] as const satisfies readonly (keyof RoleplayCompletedDetail)[];

function hasFullDimensionScores(row: RoleplayCompletedDetail): boolean {
  return DIMENSION_SCORE_KEYS.every(
    (k) => row[k] != null && Number.isFinite(row[k] as number),
  );
}

export function roundOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

function takeRecentCompleted(
  sessions: RoleplayCompletedDetail[],
  n: number,
): RoleplayCompletedDetail[] {
  return [...sessions]
    .filter((s) => s.status === "COMPLETED" && s.finishedAt)
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))
    .slice(0, n);
}

function avgDimension(
  rows: RoleplayCompletedDetail[],
  key: (typeof DIMENSION_SCORE_KEYS)[number],
): number | null {
  if (rows.length === 0) return null;
  const vals = rows.map((r) => r[key] as number);
  return roundOneDecimal(vals.reduce((s, v) => s + v, 0) / vals.length);
}

export function buildDimensionAverages(
  rows: RoleplayCompletedDetail[],
): RoleplayDimensionAverages | null {
  const cohort = rows.filter(hasFullDimensionScores);
  if (cohort.length === 0) return null;
  return {
    empathy: avgDimension(cohort, "scoreEmpathy"),
    structure: avgDimension(cohort, "scoreStructure"),
    factCheck: avgDimension(cohort, "scoreFactCheck"),
    strategy: avgDimension(cohort, "scoreStrategy"),
    advance: avgDimension(cohort, "scoreClosing"),
  };
}

/** 首頁均分＝五維顯示值加總（避免各維四捨五入後與場均分差 0.1） */
export function radarOverallFromDimensionAverages(avg: RoleplayDimensionAverages): number {
  return roundOneDecimal(DIMENSION_IDS.reduce((s, id) => s + (avg[id] ?? 0), 0));
}

/** 近 N 場完賽的五維均分加總（與首頁雷達一致）；無五維資料時退回場次總分均値 */
export function computeRadarAvgFromCompletedDetails(
  rows: RoleplayCompletedDetail[],
  lastN = OVERVIEW_RADAR_LAST_N,
): number | null {
  const recent = takeRecentCompleted(rows, lastN);
  if (recent.length === 0) return null;
  const dimensionAverages = buildDimensionAverages(recent);
  if (dimensionAverages) {
    return radarOverallFromDimensionAverages(dimensionAverages);
  }
  const scores = recent.map((r) => r.score).filter((n) => Number.isFinite(n));
  if (scores.length === 0) return null;
  return roundOneDecimal(scores.reduce((a, b) => a + b, 0) / scores.length);
}
