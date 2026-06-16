import {
  completedDetailToHistoryItem,
  parseReportJson,
  parseRoleplayTranscriptLines,
  type RoleplayCompletedDetail,
  type RoleplayTranscriptLine,
} from "@/lib/bq/roleplay-sessions-bq";
import {
  isGarbageIssue,
  isRawRagDump,
  rebuildCorrectionsFromTranscript,
} from "@/lib/roleplay/engine/correction-builder";
import { needsCorrectionRebuild } from "@/lib/roleplay/engine/correction-version";
import type { RoleplayCorrectionPoint } from "@/lib/roleplay/session-types";
import type { RoleplayScoreResult } from "@/lib/roleplay/session-types";
import type { RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";
import type { RoleplayHistoryItem } from "@/lib/roleplay/roleplay-types-api";

/** 與評分報告頁 enrichScoreResult 相同過濾，避免紀錄詳情與剛結束報告不一致 */
export function filterDisplayCorrectionPoints(
  points: RoleplayCorrectionPoint[],
): RoleplayCorrectionPoint[] {
  return points.filter(
    (p) => !isGarbageIssue(p.issue) && !isRawRagDump(p.correctGuide),
  );
}

export function finalizeScoreResultForDisplay(
  result: RoleplayScoreResult,
): RoleplayScoreResult {
  const correctionPoints = filterDisplayCorrectionPoints(result.correctionPoints ?? []);
  return {
    ...result,
    correctionPoints,
    improvementTips: [],
    unusedStrategies: correctionPoints.map((c) => c.issue).slice(0, 5),
  };
}

export type RoleplaySessionDetailView = {
  sessionId: string;
  status: "COMPLETED" | "STARTED";
  startedAt: string;
  completedAt: string | null;
  targetModel: string;
  competitor: string;
  score: number | null;
  grade: string;
  displayName?: string;
  historyItem: RoleplayHistoryItem | null;
  transcriptLines: RoleplayTranscriptLine[];
  sessionConfig?: RoleplaySessionConfig;
};

export type HistoryItemOptions = {
  /** 僅單場詳情：版本過舊或無待加強時才觸發 Gemini 重算 */
  recomputeIfStale?: boolean;
};

/**
 * 列表／首頁：只讀 BQ 已存待加強（不呼叫 Gemini）。
 * 單場詳情：recomputeIfStale=true 且 rubric 版本過舊時才重算並回傳新結果（尚未寫回 BQ）。
 */
export async function historyItemFromCompletedDetail(
  d: RoleplayCompletedDetail,
  options?: HistoryItemOptions,
): Promise<RoleplayHistoryItem> {
  const item = completedDetailToHistoryItem(d);
  if (item.status !== "COMPLETED") return item;

  const report = parseReportJson(d.reportJson);
  const storedPoints = filterDisplayCorrectionPoints(
    item.correctionPoints.length > 0 ? item.correctionPoints : report.correctionPoints,
  );
  item.correctionPoints = storedPoints;

  if (!options?.recomputeIfStale) return item;
  if (!needsCorrectionRebuild(report.rubricVersion, storedPoints.length > 0)) return item;
  if (!d.transcript?.trim()) return item;

  try {
    const rebuilt = await rebuildCorrectionsFromTranscript({
      transcript: d.transcript,
      competitor: d.competitor,
      targetModel: d.targetModel,
      difficulty: String(d.difficulty),
      ageRange: d.ageRange,
      facts: d.scenarioFacts ?? report.scenarioFacts,
    });
    if (rebuilt.length > 0) {
      item.correctionPoints = filterDisplayCorrectionPoints(rebuilt);
    }
  } catch (e) {
    console.warn("[roleplay] rebuild corrections from transcript failed", d.sessionId, e);
  }
  return item;
}

export async function buildRoleplaySessionDetail(
  d: RoleplayCompletedDetail,
  meta?: { displayName?: string },
): Promise<RoleplaySessionDetailView> {
  const completed = d.status === "COMPLETED";
  // 與剛結束的評分報告一致：讀 BQ 已存待加強，不在詳情頁重跑 Gemini
  const historyItem = completed
    ? await historyItemFromCompletedDetail(d, { recomputeIfStale: false })
    : null;
  return {
    sessionId: d.sessionId,
    status: d.status,
    startedAt: d.startedAt,
    completedAt: completed && d.finishedAt ? d.finishedAt : null,
    targetModel: d.targetModel,
    competitor: d.competitor,
    score: completed ? d.score : null,
    grade: completed ? d.grade : "",
    displayName: meta?.displayName,
    historyItem,
    transcriptLines: parseRoleplayTranscriptLines(d.transcript),
    sessionConfig: historyItem?.sessionConfig,
  };
}

/** 歷史列表：零 Gemini，只讀 DB */
export function historyItemFromCompletedDetailSync(
  d: RoleplayCompletedDetail,
): RoleplayHistoryItem {
  const item = completedDetailToHistoryItem(d);
  if (item.status !== "COMPLETED") return item;
  const report = parseReportJson(d.reportJson);
  if (item.correctionPoints.length === 0 && report.correctionPoints.length > 0) {
    item.correctionPoints = filterDisplayCorrectionPoints(report.correctionPoints);
  } else {
    item.correctionPoints = filterDisplayCorrectionPoints(item.correctionPoints);
  }
  return item;
}
