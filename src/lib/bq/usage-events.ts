import { randomUUID } from "node:crypto";
import { classifyCompetitorQuestion } from "@/lib/analytics/competitor-analytics";
import type { QueryLog } from "@/lib/analytics/types";
import { getBigQueryClient, getBigQueryScriptDrillsConfig } from "@/lib/bq/script-drills-insert";
import { bqTimestampToIso } from "@/lib/datetime/asked-at";

type InsertUsageEventInput = {
  userId: string;
  username: string;
  branch: string;
  tenureYears?: number;
  assistantType: "sales" | "roleplay";
  questionKind: "bank" | "new";
  question: string;
  replySummary?: string;
  inQuestionBank?: boolean;
};

function eventsTable() {
  const { projectId, dataset } = getBigQueryScriptDrillsConfig();
  return `\`${projectId}.${dataset}.usage_events\``;
}

export async function insertUsageEvent(input: InsertUsageEventInput): Promise<void> {
  const client = getBigQueryClient();
  await client.query({
    query: `
      INSERT INTO ${eventsTable()}
      (event_id, user_id, username, branch, tenure_years, assistant_type, question_kind, question, reply_summary, in_question_bank, asked_at)
      VALUES
      (@eventId, @userId, @username, @branch, @tenureYears, @assistantType, @questionKind, @question, @replySummary, @inQuestionBank, CURRENT_TIMESTAMP())
    `,
    params: {
      eventId: randomUUID(),
      userId: input.userId,
      username: input.username,
      branch: input.branch,
      tenureYears: input.tenureYears ?? 0,
      assistantType: input.assistantType,
      questionKind: input.questionKind,
      question: input.question,
      replySummary: input.replySummary ?? "",
      inQuestionBank: Boolean(input.inQuestionBank),
    },
  });
}

export async function listUsageLogs(filters?: {
  branch?: string;
  assistantType?: "sales" | "roleplay";
  dateFrom?: string;
  dateTo?: string;
}): Promise<QueryLog[]> {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters?.branch && filters.branch !== "all") {
    clauses.push("branch = @branch");
    params.branch = filters.branch;
  }
  if (filters?.assistantType) {
    clauses.push("assistant_type = @assistantType");
    params.assistantType = filters.assistantType;
  }
  if (filters?.dateFrom) {
    clauses.push("DATE(asked_at) >= DATE(@dateFrom)");
    params.dateFrom = filters.dateFrom;
  }
  if (filters?.dateTo) {
    clauses.push("DATE(asked_at) <= DATE(@dateTo)");
    params.dateTo = filters.dateTo;
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: `
      SELECT
        event_id,
        question,
        reply_summary,
        FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', asked_at, 'Asia/Taipei') AS asked_at,
        branch,
        username,
        tenure_years,
        assistant_type,
        question_kind
      FROM ${eventsTable()}
      ${where}
      ORDER BY asked_at DESC
      LIMIT 2000
    `,
    params,
  });

  return (rows as Record<string, unknown>[]).map((row) => {
    const question = String(row.question ?? "");
    const category = classifyCompetitorQuestion(question);
    const isCompetitor = category === "compare" || /hr-v|kicks|rav4|corolla|cx-5|競品|比較/i.test(question);
    return {
      id: String(row.event_id ?? ""),
      question,
      replySummary: String(row.reply_summary ?? ""),
      fullReply: String(row.reply_summary ?? ""),
      askedAt: bqTimestampToIso(row.asked_at) ?? "",
      branch: String(row.branch ?? ""),
      agentName: String(row.username ?? ""),
      tenureYears: Number(row.tenure_years ?? 0),
      assistantType: String(row.assistant_type ?? "sales") as "sales" | "roleplay",
      questionKind: String(row.question_kind ?? "bank") as "bank" | "new",
      isCompetitor,
      competitorTags: isCompetitor ? [category] : [],
      dedupCluster: category === "other" ? undefined : category,
    } satisfies QueryLog;
  });
}
