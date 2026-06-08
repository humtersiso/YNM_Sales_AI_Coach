import { getBigQueryClient, getBigQueryScriptDrillsConfig } from "@/lib/bq/script-drills-insert";
import type { RoleplayDrillDifficulty, RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";
import type { RoleplayHistoryItem } from "@/lib/roleplay/roleplay-types-api";
import { inferCorrectionCategory, normalizeCorrectionPoint } from "@/lib/roleplay/engine/correction-builder";
import { archiveFinishedSession } from "@/lib/roleplay/engine/session-store";
import { coalesceAdjacentAgentTurns } from "@/lib/roleplay/engine/turn-coalesce";
import { ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";
import { ROLEPLAY_DIFFICULTIES } from "@/lib/roleplay/catalog";
import type {
  RoleplayChatTurn,
  RoleplayCorrectionPoint,
  RoleplaySession,
  RoleplayScoreResult,
} from "@/lib/roleplay/session-types";

export type RoleplaySessionStatus = "STARTED" | "COMPLETED";

export type RoleplaySessionRecord = {
  sessionId: string;
  status: RoleplaySessionStatus;
  userId: string;
  username: string;
  branch: string;
  personaId: string;
  competitor: string;
  productLine: string;
  targetModel: string;
  ageRange: string;
  difficulty: RoleplayDrillDifficulty | string;
  score: number;
  grade: string;
  startedAt: string;
  finishedAt: string;
};

export type RoleplayTranscriptLine = {
  at: string;
  role: "customer" | "agent";
  content: string;
};

export type RoleplayCompletedDetail = RoleplaySessionRecord & {
  scoreEmpathy: number | null;
  scoreStructure: number | null;
  scoreFactCheck: number | null;
  scoreStrategy: number | null;
  scoreClosing: number | null;
  summary: string;
  improvementTips: string[];
  correctionPoints: RoleplayCorrectionPoint[];
  unusedStrategies: string[];
  /** 情境佐證事實（來自 report_json 或 demo 補齊） */
  scenarioFacts?: { label: string; value: string }[];
  factCheckComment?: string;
  /** Gate2 report_json 原文（含 dashboardBriefing 快取） */
  reportJson?: string | null;
  transcript?: string | null;
};

/** 將 BQ transcript 字串解析為對話列（供後台檢視） */
export function parseRoleplayTranscriptLines(raw: string | null | undefined): RoleplayTranscriptLine[] {
  if (!raw?.trim()) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^\[([^\]]+)\]\s*(客戶|業代)[：:]\s*(.*)$/);
      if (!m) {
        return { at: "", role: "agent" as const, content: line };
      }
      return {
        at: m[1],
        role: m[2] === "客戶" ? ("customer" as const) : ("agent" as const),
        content: m[3],
      };
    });
}

const DIMENSION_LABELS: Record<string, string> = {
  empathy: "同理承接",
  structure: "論點完整度",
  factCheck: "事實引用正確",
  strategy: "策略使用",
  advance: "推進成交",
};

function factsTable(): string {
  const { projectId, dataset } = getBigQueryScriptDrillsConfig();
  const table =
    (process.env.ROLEPLAY_BQ_TABLE ?? "roleplay_session_facts").trim() ||
    "roleplay_session_facts";
  return `\`${projectId}.${dataset}.${table}\``;
}

function sessionDimensions(session: RoleplaySession): {
  config: RoleplaySessionConfig | null;
  targetModel: string;
  competitor: string;
  customerType: string;
  ageRange: string;
  difficulty: string;
  maxTurns: number;
} {
  const config = session.config ?? null;
  return {
    config,
    targetModel: session.scenario.sectionA.productDisplayName,
    competitor: config?.competitor ?? session.scenario.sectionA.competitor,
    customerType: config?.personaId ?? session.personaId,
    ageRange: config?.ageRange ?? session.scenario.sectionE.ageRange ?? "30-40",
    difficulty:
      config?.difficulty ??
      (session.scenario.sectionE.difficulty as string) ??
      "advanced",
    maxTurns: session.maxTurns,
  };
}

export function formatRoleplayTranscript(turns: RoleplayChatTurn[]): string {
  return coalesceAdjacentAgentTurns(turns)
    .map((t) => {
      const who = t.role === "customer" ? "客戶" : "業代";
      return `[${t.at}] ${who}：${t.content}`;
    })
    .join("\n");
}

function buildReportJson(
  result: RoleplayScoreResult,
  scenarioFacts?: { label: string; value: string }[],
): string {
  return JSON.stringify({
    summary: result.summary,
    dimensions: result.dimensions,
    improvementTips: result.improvementTips,
    correctionPoints: (result.correctionPoints ?? []).map((p) => ({
      issue: p.issue,
      category: p.category,
      customerAsk: p.customerAsk,
      whatYouSaid: p.whatYouSaid,
      correctGuide: p.correctGuide,
    })),
    unusedStrategies: result.unusedStrategies,
    gradeLabel: result.gradeLabel,
    advice: result.advice,
    scenarioFacts: (scenarioFacts ?? []).map((f) => ({
      label: f.label,
      value: f.value,
    })),
  });
}

function scoreColumnMap(result: RoleplayScoreResult): Record<string, number | null> {
  const find = (id: string) =>
    result.dimensions.find((d) => d.dimensionId === id)?.score ?? null;
  return {
    score_empathy: find("empathy"),
    score_structure: find("structure"),
    score_fact_check: find("factCheck"),
    score_strategy: find("strategy"),
    score_closing: find("advance"),
    score_total: result.score,
  };
}

function parseReportJson(raw: string | null | undefined): {
  summary: string;
  improvementTips: string[];
  correctionPoints: {
    issue: string;
    category?: string;
    customerAsk?: string;
    whatYouSaid?: string;
    correctGuide: string;
  }[];
  unusedStrategies: string[];
  scenarioFacts: { label: string; value: string }[];
  dimensions: { dimensionId: string; label: string; score: number; comment: string }[];
} {
  if (!raw?.trim()) {
    return {
      summary: "",
      improvementTips: [],
      correctionPoints: [],
      unusedStrategies: [],
      scenarioFacts: [],
      dimensions: [],
    };
  }
  try {
    const j = JSON.parse(raw) as {
      summary?: string;
      improvementTips?: string[];
      correctionPoints?: {
        issue?: string;
        category?: string;
        customerAsk?: string;
        whatYouSaid?: string;
        correctGuide?: string;
      }[];
      unusedStrategies?: string[];
      scenarioFacts?: { label?: string; value?: string }[];
      dimensions?: { dimensionId?: string; label?: string; score?: number; comment?: string }[];
    };
    const correctionPoints = Array.isArray(j.correctionPoints)
      ? j.correctionPoints
          .map((c) =>
            normalizeCorrectionPoint({
              issue: String(c.issue ?? "").trim(),
              category:
                c.category === "fact" || c.category === "strategy"
                  ? c.category
                  : inferCorrectionCategory(String(c.issue ?? "")),
              customerAsk: String(c.customerAsk ?? "").trim() || undefined,
              whatYouSaid: String(c.whatYouSaid ?? "").trim() || undefined,
              correctGuide: String(c.correctGuide ?? "").trim(),
            }),
          )
          .filter((c) => c.issue && c.correctGuide)
      : [];
    return {
      summary: String(j.summary ?? "").trim(),
      improvementTips: Array.isArray(j.improvementTips) ? j.improvementTips.map(String) : [],
      correctionPoints,
      unusedStrategies: Array.isArray(j.unusedStrategies) ? j.unusedStrategies.map(String) : [],
      scenarioFacts: Array.isArray(j.scenarioFacts)
        ? j.scenarioFacts
            .map((f) => ({
              label: String(f.label ?? "").trim(),
              value: String(f.value ?? "").trim(),
            }))
            .filter((f) => f.label || f.value)
        : [],
      dimensions: (j.dimensions ?? []).map((d) => ({
        dimensionId: String(d.dimensionId ?? ""),
        label: String(d.label ?? DIMENSION_LABELS[d.dimensionId ?? ""] ?? d.dimensionId ?? ""),
        score: Number(d.score ?? 0),
        comment: String(d.comment ?? ""),
      })),
    };
  } catch {
    return {
      summary: "",
      improvementTips: [],
      correctionPoints: [],
      unusedStrategies: [],
      scenarioFacts: [],
      dimensions: [],
    };
  }
}

/** 將 BQ TIMESTAMP / Date / 字串轉成 ISO 字串 */
export function parseBqTimestamp(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    const inner = (value as { value: unknown }).value;
    return parseBqTimestamp(inner);
  }
  const s = String(value).trim();
  if (!s) return "";
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return s;
}

function rowToCompletedDetail(r: Record<string, unknown>): RoleplayCompletedDetail {
  const report = parseReportJson(String(r.reportJson ?? ""));
  const personaId = String(r.personaId ?? "");
  const status = String(r.status ?? "COMPLETED") === "STARTED" ? "STARTED" : "COMPLETED";
  return {
    sessionId: String(r.sessionId),
    status,
    userId: String(r.userId),
    username: String(r.username ?? ""),
    branch: String(r.branch ?? ""),
    personaId,
    competitor: String(r.competitor ?? ""),
    productLine: "",
    targetModel: String(r.targetModel ?? ""),
    ageRange: String(r.ageRange ?? ""),
    difficulty: String(r.difficulty ?? "advanced"),
    score: r.score != null ? Number(r.score) : 0,
    grade: String(r.grade ?? ""),
    startedAt: parseBqTimestamp(r.startedAt),
    finishedAt: parseBqTimestamp(r.finishedAt),
    scoreEmpathy: r.scoreEmpathy != null ? Number(r.scoreEmpathy) : null,
    scoreStructure: r.scoreStructure != null ? Number(r.scoreStructure) : null,
    scoreFactCheck: r.scoreFactCheck != null ? Number(r.scoreFactCheck) : null,
    scoreStrategy: r.scoreStrategy != null ? Number(r.scoreStrategy) : null,
    scoreClosing: r.scoreClosing != null ? Number(r.scoreClosing) : null,
    summary: report.summary,
    improvementTips: report.improvementTips,
    correctionPoints: report.correctionPoints,
    unusedStrategies:
      report.unusedStrategies.length > 0
        ? report.unusedStrategies
        : report.correctionPoints.map((c) => c.issue),
    scenarioFacts: report.scenarioFacts,
    factCheckComment:
      report.dimensions.find((d) => d.dimensionId === "factCheck")?.comment ?? "",
    reportJson: r.reportJson != null ? String(r.reportJson) : null,
    transcript: r.transcript != null ? String(r.transcript) : null,
  };
}

function dimensionsFromDetail(d: RoleplayCompletedDetail) {
  const ids = ["empathy", "structure", "factCheck", "strategy", "advance"] as const;
  return ids.map((id) => {
    const scoreMap: Record<string, number | null> = {
      empathy: d.scoreEmpathy,
      structure: d.scoreStructure,
      factCheck: d.scoreFactCheck,
      strategy: d.scoreStrategy,
      advance: d.scoreClosing,
    };
    return {
      dimensionId: id,
      label: DIMENSION_LABELS[id],
      score: scoreMap[id] ?? 0,
      maxScore: 20,
      comment: "",
    };
  });
}

export function completedDetailToHistoryItem(d: RoleplayCompletedDetail): RoleplayHistoryItem {
  const diffLabel =
    ROLEPLAY_DIFFICULTIES.find((x) => x.id === d.difficulty)?.label ?? String(d.difficulty);
  const personaName =
    ROLEPLAY_GLOBAL_CONFIG.personas.find((p) => p.id === d.personaId)?.name ?? d.personaId;
  const completed = d.status === "COMPLETED";
  const completedAt = completed && d.finishedAt ? d.finishedAt : null;
  return {
    sessionId: d.sessionId,
    status: d.status,
    startedAt: d.startedAt,
    completedAt,
    targetModel: d.targetModel,
    competitor: d.competitor,
    customerType: d.personaId,
    customerTypeName: personaName,
    ageRange: d.ageRange,
    difficulty: d.difficulty,
    difficultyLabel: diffLabel,
    score: completed ? d.score : null,
    grade: completed ? d.grade : "",
    summary: completed ? d.summary : "",
    dimensions: completed ? dimensionsFromDetail(d) : [],
    improvementTips: completed ? d.improvementTips : [],
    correctionPoints: completed ? d.correctionPoints : [],
    unusedStrategies: completed ? d.unusedStrategies : [],
  };
}

const HISTORY_SELECT = `
  session_id AS sessionId,
  status,
  agent_id AS userId,
  agent_username AS username,
  dealership_id AS branch,
  customer_type AS personaId,
  competitor,
  target_model AS targetModel,
  age_range AS ageRange,
  difficulty,
  score_total AS score,
  grade,
  score_empathy AS scoreEmpathy,
  score_structure AS scoreStructure,
  score_fact_check AS scoreFactCheck,
  score_strategy AS scoreStrategy,
  score_closing AS scoreClosing,
  created_at AS startedAt,
  completed_at AS finishedAt,
  report_json AS reportJson
`;

function dedupeSessionsPreferCompleted(
  rows: RoleplayCompletedDetail[],
): RoleplayCompletedDetail[] {
  const map = new Map<string, RoleplayCompletedDetail>();
  for (const row of rows) {
    const prev = map.get(row.sessionId);
    if (!prev || row.status === "COMPLETED") {
      map.set(row.sessionId, row);
    }
  }
  return [...map.values()].sort((a, b) => {
    const ta = a.status === "COMPLETED" ? a.finishedAt : a.startedAt;
    const tb = b.status === "COMPLETED" ? b.finishedAt : b.startedAt;
    return String(tb).localeCompare(String(ta));
  });
}

/** 歷史列表：含未完賽（STARTED）與完賽（COMPLETED），每 session 一筆 */
export async function listUserSessionsForHistory(
  userId: string,
  limit = 20,
): Promise<RoleplayCompletedDetail[]> {
  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId) return [];

  const fetchLimit = Math.min(limit * 3, 100);

  const runQuery = async (withReport: boolean) => {
    const client = getBigQueryClient();
    const select = withReport
      ? HISTORY_SELECT
      : HISTORY_SELECT.replace(",\n  report_json AS reportJson", "");
    const [rows] = await client.query({
      query: `
        SELECT ${select}
        FROM ${factsTable()}
        WHERE agent_id = @userId AND status IN ('STARTED', 'COMPLETED')
        ORDER BY COALESCE(completed_at, created_at) DESC
        LIMIT @fetchLimit
      `,
      params: { userId, fetchLimit },
      location: "asia-east1",
    });
    return (rows as Record<string, unknown>[]).map(rowToCompletedDetail);
  };

  try {
    return dedupeSessionsPreferCompleted(await runQuery(true)).slice(0, limit);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/report_json|Unrecognized name/i.test(msg)) {
      try {
        return dedupeSessionsPreferCompleted(await runQuery(false)).slice(0, limit);
      } catch {
        console.warn("[roleplay] list history failed", e);
        return [];
      }
    }
    console.warn("[roleplay] list history failed", e);
    return [];
  }
}

/** Gate 1：開始對練（非阻塞） */
export function logRoleplayGate1Started(session: RoleplaySession): void {
  void insertGate1(session).catch((e) => {
    console.warn("[roleplay] Gate1 BQ write failed", e);
  });
}

async function insertGate1(session: RoleplaySession): Promise<void> {
  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId) return;

  const dim = sessionDimensions(session);
  const client = getBigQueryClient();

  await client.query({
    query: `
      INSERT INTO ${factsTable()}
      (session_id, status, agent_id, agent_username, dealership_id, created_at, completed_at,
       target_model, competitor, customer_type, age_range, difficulty, max_turns,
       score_empathy, score_structure, score_fact_check, score_strategy, score_closing,
       score_total, grade, transcript, report_json)
      VALUES
      (@sessionId, 'STARTED', @agentId, @username, @dealershipId, TIMESTAMP(@createdAt), NULL,
       @targetModel, @competitor, @customerType, @ageRange, @difficulty, @maxTurns,
       NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
    `,
    params: {
      sessionId: session.sessionId,
      agentId: session.userId,
      username: session.username,
      dealershipId: session.branch || "",
      createdAt: session.startedAt,
      targetModel: dim.targetModel,
      competitor: dim.competitor,
      customerType: dim.customerType,
      ageRange: dim.ageRange,
      difficulty: dim.difficulty,
      maxTurns: dim.maxTurns,
    },
  });
}

/** Gate 2：評分完成（非阻塞，舊路徑） */
export function logRoleplayGate2Completed(session: RoleplaySession): void {
  void insertGate2(session).catch((e) => {
    console.warn("[roleplay] Gate2 BQ write failed", e);
  });
}

/** Gate 2：完賽寫入 BQ；finish API 會 await */
export async function persistRoleplayGate2Completed(session: RoleplaySession): Promise<void> {
  try {
    await insertGate2(session);
  } catch (e) {
    console.warn("[roleplay] Gate2 BQ write failed", e);
    throw e;
  }
}

async function insertGate2(session: RoleplaySession): Promise<void> {
  if (!session.scoreResult || !session.finishedAt) return;

  const dim = sessionDimensions(session);
  const scores = scoreColumnMap(session.scoreResult);
  const transcript = formatRoleplayTranscript(session.turns);
  const reportJson = buildReportJson(
    session.scoreResult,
    session.scenario.sectionC.facts,
  );

  const record: RoleplaySessionRecord = {
    sessionId: session.sessionId,
    status: "COMPLETED",
    userId: session.userId,
    username: session.username,
    branch: session.branch,
    personaId: dim.customerType,
    competitor: dim.competitor,
    productLine: session.scenario.sectionA.productLine,
    targetModel: dim.targetModel,
    ageRange: dim.ageRange,
    difficulty: dim.difficulty,
    score: session.scoreResult.score,
    grade: session.scoreResult.grade,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
  };
  archiveFinishedSession(record);

  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId) return;

  const client = getBigQueryClient();
  try {
    await client.query({
      query: `
        INSERT INTO ${factsTable()}
        (session_id, status, agent_id, agent_username, dealership_id, created_at, completed_at,
         target_model, competitor, customer_type, age_range, difficulty, max_turns,
         score_empathy, score_structure, score_fact_check, score_strategy, score_closing,
         score_total, grade, transcript, report_json)
        VALUES
        (@sessionId, 'COMPLETED', @agentId, @username, @dealershipId, TIMESTAMP(@startedAt), TIMESTAMP(@completedAt),
         @targetModel, @competitor, @customerType, @ageRange, @difficulty, @maxTurns,
         @scoreEmpathy, @scoreStructure, @scoreFactCheck, @scoreStrategy, @scoreClosing,
         @scoreTotal, @grade, @transcript, @reportJson)
      `,
      params: {
        sessionId: session.sessionId,
        agentId: session.userId,
        username: session.username,
        dealershipId: session.branch || "",
        startedAt: session.startedAt,
        completedAt: session.finishedAt,
        targetModel: dim.targetModel,
        competitor: dim.competitor,
        customerType: dim.customerType,
        ageRange: dim.ageRange,
        difficulty: dim.difficulty,
        maxTurns: dim.maxTurns,
        scoreEmpathy: scores.score_empathy,
        scoreStructure: scores.score_structure,
        scoreFactCheck: scores.score_fact_check,
        scoreStrategy: scores.score_strategy,
        scoreClosing: scores.score_closing,
        scoreTotal: scores.score_total,
        grade: session.scoreResult.grade,
        transcript,
        reportJson,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/report_json|Unrecognized name/i.test(msg)) {
      await client.query({
        query: `
          INSERT INTO ${factsTable()}
          (session_id, status, agent_id, agent_username, dealership_id, created_at, completed_at,
           target_model, competitor, customer_type, age_range, difficulty, max_turns,
           score_empathy, score_structure, score_fact_check, score_strategy, score_closing,
           score_total, grade, transcript)
          VALUES
          (@sessionId, 'COMPLETED', @agentId, @username, @dealershipId, TIMESTAMP(@startedAt), TIMESTAMP(@completedAt),
           @targetModel, @competitor, @customerType, @ageRange, @difficulty, @maxTurns,
           @scoreEmpathy, @scoreStructure, @scoreFactCheck, @scoreStrategy, @scoreClosing,
           @scoreTotal, @grade, @transcript)
        `,
        params: {
          sessionId: session.sessionId,
          agentId: session.userId,
          username: session.username,
          dealershipId: session.branch || "",
          startedAt: session.startedAt,
          completedAt: session.finishedAt,
          targetModel: dim.targetModel,
          competitor: dim.competitor,
          customerType: dim.customerType,
          ageRange: dim.ageRange,
          difficulty: dim.difficulty,
          maxTurns: dim.maxTurns,
          scoreEmpathy: scores.score_empathy,
          scoreStructure: scores.score_structure,
          scoreFactCheck: scores.score_fact_check,
          scoreStrategy: scores.score_strategy,
          scoreClosing: scores.score_closing,
          scoreTotal: scores.score_total,
          grade: session.scoreResult.grade,
          transcript,
        },
      });
    } else {
      throw e;
    }
  }
}

const COMPLETED_SELECT = `
  session_id AS sessionId,
  agent_id AS userId,
  agent_username AS username,
  dealership_id AS branch,
  customer_type AS personaId,
  competitor,
  target_model AS targetModel,
  age_range AS ageRange,
  difficulty,
  score_total AS score,
  grade,
  score_empathy AS scoreEmpathy,
  score_structure AS scoreStructure,
  score_fact_check AS scoreFactCheck,
  score_strategy AS scoreStrategy,
  score_closing AS scoreClosing,
  created_at AS startedAt,
  completed_at AS finishedAt,
  report_json AS reportJson
`;

export async function listCompletedSessionsDetail(
  userId: string,
  limit = 50,
): Promise<RoleplayCompletedDetail[]> {
  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId) return [];

  try {
    const client = getBigQueryClient();
    const [rows] = await client.query({
      query: `
        SELECT ${COMPLETED_SELECT}
        FROM ${factsTable()}
        WHERE agent_id = @userId AND status = 'COMPLETED'
        ORDER BY completed_at DESC
        LIMIT @limit
      `,
      params: { userId, limit },
    });
    return (rows as Record<string, unknown>[]).map(rowToCompletedDetail);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/report_json|Unrecognized name/i.test(msg)) {
      try {
        const client = getBigQueryClient();
        const [rows] = await client.query({
          query: `
            SELECT
              session_id AS sessionId,
              agent_id AS userId,
              agent_username AS username,
              dealership_id AS branch,
              customer_type AS personaId,
              competitor,
              target_model AS targetModel,
              age_range AS ageRange,
              difficulty,
              score_total AS score,
              grade,
              score_empathy AS scoreEmpathy,
              score_structure AS scoreStructure,
              score_fact_check AS scoreFactCheck,
              score_strategy AS scoreStrategy,
              score_closing AS scoreClosing,
              created_at AS startedAt,
              completed_at AS finishedAt
            FROM ${factsTable()}
            WHERE agent_id = @userId AND status = 'COMPLETED'
            ORDER BY completed_at DESC
            LIMIT @limit
          `,
          params: { userId, limit },
        });
        return (rows as Record<string, unknown>[]).map(rowToCompletedDetail);
      } catch {
        console.warn("[roleplay] list completed failed", e);
        return [];
      }
    }
    console.warn("[roleplay] list completed failed", e);
    return [];
  }
}

export async function listRoleplaySessionsByUser(
  userId: string,
  limit = 50,
): Promise<RoleplaySessionRecord[]> {
  const details = await listCompletedSessionsDetail(userId, limit);
  return details.map((d) => ({
    sessionId: d.sessionId,
    status: d.status,
    userId: d.userId,
    username: d.username,
    branch: d.branch,
    personaId: d.personaId,
    competitor: d.competitor,
    productLine: d.productLine,
    targetModel: d.targetModel,
    ageRange: d.ageRange,
    difficulty: d.difficulty,
    score: d.score,
    grade: d.grade,
    startedAt: d.startedAt,
    finishedAt: d.finishedAt,
  }));
}

export async function countUserRoleplaySessions(userId: string): Promise<{
  started: number;
  completed: number;
}> {
  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId) return { started: 0, completed: 0 };

  try {
    const client = getBigQueryClient();
    const [rows] = await client.query({
      query: `
        SELECT status, COUNT(DISTINCT session_id) AS cnt
        FROM ${factsTable()}
        WHERE agent_id = @userId AND status IN ('STARTED', 'COMPLETED')
        GROUP BY status
      `,
      params: { userId },
      location: "asia-east1",
    });
    let started = 0;
    let completed = 0;
    for (const r of rows as { status: string; cnt: number }[]) {
      if (r.status === "STARTED") started = Number(r.cnt);
      if (r.status === "COMPLETED") completed = Number(r.cnt);
    }
    return { started, completed };
  } catch (e) {
    console.warn("[roleplay] count user sessions failed", e);
    return { started: 0, completed: 0 };
  }
}

/** 管理後台：單一場次詳情（含 transcript；同 sessionId 優先 COMPLETED） */
export async function getAdminRoleplaySessionById(
  sessionId: string,
): Promise<RoleplayCompletedDetail | null> {
  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId || !sessionId.trim()) return null;

  const runQuery = async (withReport: boolean) => {
    const client = getBigQueryClient();
    const reportCol = withReport ? ",\n  report_json AS reportJson" : "";
    const [rows] = await client.query({
      query: `
        SELECT
          status,
          session_id AS sessionId,
          agent_id AS userId,
          agent_username AS username,
          dealership_id AS branch,
          customer_type AS personaId,
          competitor,
          target_model AS targetModel,
          age_range AS ageRange,
          difficulty,
          score_total AS score,
          grade,
          score_empathy AS scoreEmpathy,
          score_structure AS scoreStructure,
          score_fact_check AS scoreFactCheck,
          score_strategy AS scoreStrategy,
          score_closing AS scoreClosing,
          created_at AS startedAt,
          completed_at AS finishedAt,
          transcript${reportCol}
        FROM ${factsTable()}
        WHERE session_id = @sessionId AND status IN ('STARTED', 'COMPLETED')
        ORDER BY COALESCE(completed_at, created_at) DESC
        LIMIT 10
      `,
      params: { sessionId: sessionId.trim() },
      location: "asia-east1",
    });
    return (rows as Record<string, unknown>[]).map(rowToCompletedDetail);
  };

  try {
    const deduped = dedupeSessionsPreferCompleted(await runQuery(true));
    return deduped[0] ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/report_json|Unrecognized name/i.test(msg)) {
      try {
        const deduped = dedupeSessionsPreferCompleted(await runQuery(false));
        return deduped[0] ?? null;
      } catch {
        console.warn("[roleplay] get admin session failed", e);
        return null;
      }
    }
    console.warn("[roleplay] get admin session failed", e);
    return null;
  }
}

/** 管理後台：全部業代對練場次（含未完賽） */
export async function listAdminRoleplaySessions(limit = 500): Promise<RoleplayCompletedDetail[]> {
  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId) return [];

  const fetchLimit = Math.min(limit, 1000);

  const runQuery = async (withReport: boolean) => {
    const client = getBigQueryClient();
    const select = withReport
      ? `status, ${COMPLETED_SELECT}`
      : `status,
        session_id AS sessionId,
        agent_id AS userId,
        agent_username AS username,
        dealership_id AS branch,
        customer_type AS personaId,
        competitor,
        target_model AS targetModel,
        age_range AS ageRange,
        difficulty,
        score_total AS score,
        grade,
        score_empathy AS scoreEmpathy,
        score_structure AS scoreStructure,
        score_fact_check AS scoreFactCheck,
        score_strategy AS scoreStrategy,
        score_closing AS scoreClosing,
        created_at AS startedAt,
        completed_at AS finishedAt`;
    const [rows] = await client.query({
      query: `
        SELECT ${select}
        FROM ${factsTable()}
        WHERE status IN ('STARTED', 'COMPLETED')
        ORDER BY COALESCE(completed_at, created_at) DESC
        LIMIT @fetchLimit
      `,
      params: { fetchLimit },
    });
    return (rows as Record<string, unknown>[]).map(rowToCompletedDetail);
  };

  try {
    return dedupeSessionsPreferCompleted(await runQuery(true));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/report_json|Unrecognized name/i.test(msg)) {
      try {
        return dedupeSessionsPreferCompleted(await runQuery(false));
      } catch {
        console.warn("[roleplay] list admin sessions failed", e);
        return [];
      }
    }
    console.warn("[roleplay] list admin sessions failed", e);
    return [];
  }
}

export async function getRoleplayFunnelSummary(filters?: {
  dealershipId?: string;
  days?: number;
}): Promise<{ started: number; completed: number; dropoff: number }> {
  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId) return { started: 0, completed: 0, dropoff: 0 };

  const days = filters?.days ?? 30;
  const clauses = ["created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)"];
  const params: Record<string, unknown> = { days };
  if (filters?.dealershipId) {
    clauses.push("dealership_id = @dealershipId");
    params.dealershipId = filters.dealershipId;
  }

  try {
    const client = getBigQueryClient();
    const [rows] = await client.query({
      query: `
        SELECT status, COUNT(DISTINCT session_id) AS cnt
        FROM ${factsTable()}
        WHERE ${clauses.join(" AND ")}
        GROUP BY status
      `,
      params,
    });

    let started = 0;
    let completed = 0;
    for (const r of rows as { status: string; cnt: number }[]) {
      if (r.status === "STARTED") started = Number(r.cnt);
      if (r.status === "COMPLETED") completed = Number(r.cnt);
    }
    return { started, completed, dropoff: Math.max(0, started - completed) };
  } catch (e) {
    console.warn("[roleplay] funnel query failed", e);
    return { started: 0, completed: 0, dropoff: 0 };
  }
}

export async function persistRoleplaySession(session: RoleplaySession): Promise<void> {
  logRoleplayGate2Completed(session);
}
