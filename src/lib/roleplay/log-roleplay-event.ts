import { insertUsageEvent } from "@/lib/bq/usage-events";
import type { RoleplaySession } from "@/lib/roleplay/session-types";

export async function logRoleplayFinish(session: RoleplaySession): Promise<void> {
  if (!session.scoreResult) return;
  const { scoreResult, scenario } = session;
  try {
    await insertUsageEvent({
      userId: session.userId,
      username: session.username,
      branch: session.branch || "—",
      assistantType: "roleplay",
      questionKind: "bank",
      question: `[${scenario.scenarioId}] ${scenario.sectionA.title}`,
      replySummary: `等級 ${scoreResult.grade}（${scoreResult.score} 分）· ${scoreResult.gradeLabel}`,
      inQuestionBank: true,
    });
  } catch (e) {
    console.error("[roleplay] usage log failed", e);
  }
}
