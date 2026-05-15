import { NextResponse } from "next/server";
import {
  getQuestionProgress,
  listActiveExperts,
  listDuplicateQuestionsForCheck,
  listExperts,
  listIncomingPreview,
  listNotifications,
  listPendingQuestionsWithTags,
  seedClarificationDemoCases,
  listSuggestions,
  listWorkflowExpertsByRequiredCodes,
} from "@/lib/excel-store/store";

export async function GET() {
  const questions = listPendingQuestionsWithTags();
  const experts = listActiveExperts();
  const suggestions = listSuggestions();
  const notifications = listNotifications();
  const allExperts = listExperts();
  const workflowExperts = listWorkflowExpertsByRequiredCodes();
  const incoming = listIncomingPreview();
  const duplicateCount = listDuplicateQuestionsForCheck().length;

  const progress = questions.map((q) => ({
    questionId: q.id,
    ...getQuestionProgress(
      q.id,
      workflowExperts.filter((e) => !e.isVirtual).map((e) => e.id),
    ),
  }));

  return NextResponse.json({
    questions,
    experts,
    allExperts,
    workflowExperts,
    suggestions,
    notifications,
    progress,
    duplicateCount,
    incoming,
  });
}

export async function POST() {
  const result = seedClarificationDemoCases();
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json(result);
}
