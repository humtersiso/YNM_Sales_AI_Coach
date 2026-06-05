import { getBigQueryClient, getBigQueryScriptDrillsConfig } from "@/lib/bq/script-drills-insert";
import type { RoleplayDashboardBriefing } from "@/lib/roleplay/roleplay-types-api";
import { parseBriefingJson } from "@/lib/roleplay/dashboard-briefing-cache";

export type RoleplayAgentDashboardRow = {
  agentId: string;
  briefing: RoleplayDashboardBriefing;
  statsFingerprint: string;
  updatedAt: string;
  lastTrigger: "gate1" | "gate2" | null;
  lastSessionId: string | null;
};

function dashboardTable(): string {
  const { projectId, dataset } = getBigQueryScriptDrillsConfig();
  const table =
    (process.env.ROLEPLAY_BQ_DASHBOARD_TABLE ?? "roleplay_agent_dashboard").trim() ||
    "roleplay_agent_dashboard";
  return `\`${projectId}.${dataset}.${table}\``;
}

function isTableNotFoundError(msg: string): boolean {
  return /Not found|notFound|404|does not exist/i.test(msg);
}

const ENSURED_KEY = "__ynmRoleplayAgentDashboardTableEnsured__";

/** 首次寫入前自動建表（避免本機未跑 ops 腳本） */
export async function ensureRoleplayAgentDashboardTable(): Promise<void> {
  const g = globalThis as typeof globalThis & { [key: string]: boolean | undefined };
  if (g[ENSURED_KEY]) return;

  const { projectId, dataset } = getBigQueryScriptDrillsConfig();
  if (!projectId) return;

  const client = getBigQueryClient();
  const table =
    (process.env.ROLEPLAY_BQ_DASHBOARD_TABLE ?? "roleplay_agent_dashboard").trim() ||
    "roleplay_agent_dashboard";

  await client.query({
    query: `
      CREATE TABLE IF NOT EXISTS \`${projectId}.${dataset}.${table}\` (
        agent_id STRING NOT NULL,
        briefing_json STRING NOT NULL,
        stats_fingerprint STRING NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        last_trigger STRING,
        last_session_id STRING
      )
    `,
    location: "asia-east1",
  });
  g[ENSURED_KEY] = true;
}

function rowToAgentDashboard(r: Record<string, unknown>): RoleplayAgentDashboardRow | null {
  const briefing = parseBriefingJson(String(r.briefingJson ?? ""));
  if (!briefing) return null;
  return {
    agentId: String(r.agentId ?? ""),
    briefing,
    statsFingerprint: String(r.statsFingerprint ?? ""),
    updatedAt: String(r.updatedAt ?? ""),
    lastTrigger:
      r.lastTrigger === "gate1" || r.lastTrigger === "gate2" ? r.lastTrigger : null,
    lastSessionId: r.lastSessionId != null ? String(r.lastSessionId) : null,
  };
}

export async function getAgentDashboardRow(
  agentId: string,
): Promise<RoleplayAgentDashboardRow | null> {
  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId || !agentId.trim()) return null;

  try {
    const client = getBigQueryClient();
    const [rows] = await client.query({
      query: `
        SELECT
          agent_id AS agentId,
          briefing_json AS briefingJson,
          stats_fingerprint AS statsFingerprint,
          updated_at AS updatedAt,
          last_trigger AS lastTrigger,
          last_session_id AS lastSessionId
        FROM ${dashboardTable()}
        WHERE agent_id = @agentId
        LIMIT 1
      `,
      params: { agentId },
      location: "asia-east1",
    });
    const first = (rows as Record<string, unknown>[])[0];
    return first ? rowToAgentDashboard(first) : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isTableNotFoundError(msg)) return null;
    console.warn("[roleplay] get agent dashboard failed", e);
    return null;
  }
}

export async function upsertAgentDashboardRow(input: {
  agentId: string;
  briefing: RoleplayDashboardBriefing;
  statsFingerprint: string;
  lastTrigger: "gate1" | "gate2";
  lastSessionId: string;
}): Promise<void> {
  const { projectId } = getBigQueryScriptDrillsConfig();
  if (!projectId) return;

  const client = getBigQueryClient();
  const now = new Date().toISOString();
  const briefingJson = JSON.stringify(input.briefing);

  await ensureRoleplayAgentDashboardTable();

  try {
    await client.query({
      query: `
      MERGE ${dashboardTable()} T
      USING (SELECT @agentId AS agent_id) S
      ON T.agent_id = S.agent_id
      WHEN MATCHED THEN
        UPDATE SET
          briefing_json = @briefingJson,
          stats_fingerprint = @statsFingerprint,
          updated_at = TIMESTAMP(@updatedAt),
          last_trigger = @lastTrigger,
          last_session_id = @lastSessionId
      WHEN NOT MATCHED THEN
        INSERT (agent_id, briefing_json, stats_fingerprint, updated_at, last_trigger, last_session_id)
        VALUES (@agentId, @briefingJson, @statsFingerprint, TIMESTAMP(@updatedAt), @lastTrigger, @lastSessionId)
    `,
    params: {
      agentId: input.agentId,
      briefingJson,
      statsFingerprint: input.statsFingerprint,
      updatedAt: now,
      lastTrigger: input.lastTrigger,
      lastSessionId: input.lastSessionId,
    },
    location: "asia-east1",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isTableNotFoundError(msg)) {
      await ensureRoleplayAgentDashboardTable();
      await client.query({
        query: `
      MERGE ${dashboardTable()} T
      USING (SELECT @agentId AS agent_id) S
      ON T.agent_id = S.agent_id
      WHEN MATCHED THEN
        UPDATE SET
          briefing_json = @briefingJson,
          stats_fingerprint = @statsFingerprint,
          updated_at = TIMESTAMP(@updatedAt),
          last_trigger = @lastTrigger,
          last_session_id = @lastSessionId
      WHEN NOT MATCHED THEN
        INSERT (agent_id, briefing_json, stats_fingerprint, updated_at, last_trigger, last_session_id)
        VALUES (@agentId, @briefingJson, @statsFingerprint, TIMESTAMP(@updatedAt), @lastTrigger, @lastSessionId)
    `,
        params: {
          agentId: input.agentId,
          briefingJson,
          statsFingerprint: input.statsFingerprint,
          updatedAt: now,
          lastTrigger: input.lastTrigger,
          lastSessionId: input.lastSessionId,
        },
        location: "asia-east1",
      });
      return;
    }
    throw e;
  }
}
