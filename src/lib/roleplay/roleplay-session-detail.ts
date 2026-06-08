import {
  completedDetailToHistoryItem,
  parseRoleplayTranscriptLines,
  type RoleplayCompletedDetail,
  type RoleplayTranscriptLine,
} from "@/lib/bq/roleplay-sessions-bq";
import { rebuildCorrectionsFromTranscript } from "@/lib/roleplay/engine/correction-builder";
import type { RoleplayHistoryItem } from "@/lib/roleplay/roleplay-types-api";

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
};

export async function historyItemFromCompletedDetail(
  d: RoleplayCompletedDetail,
): Promise<RoleplayHistoryItem> {
  const item = completedDetailToHistoryItem(d);
  if (
    item.status === "COMPLETED" &&
    item.correctionPoints.length === 0 &&
    d.transcript?.trim()
  ) {
    try {
      item.correctionPoints = await rebuildCorrectionsFromTranscript({
        transcript: d.transcript,
        competitor: d.competitor,
        targetModel: d.targetModel,
        difficulty: String(d.difficulty),
        ageRange: d.ageRange,
        facts: d.scenarioFacts,
      });
    } catch (e) {
      console.warn("[roleplay] rebuild corrections from transcript failed", d.sessionId, e);
    }
  }
  return item;
}

export async function buildRoleplaySessionDetail(
  d: RoleplayCompletedDetail,
  meta?: { displayName?: string },
): Promise<RoleplaySessionDetailView> {
  const completed = d.status === "COMPLETED";
  const historyItem = completed ? await historyItemFromCompletedDetail(d) : null;
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
  };
}
