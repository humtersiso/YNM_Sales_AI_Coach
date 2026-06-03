import { randomUUID } from "node:crypto";
import { getBigQueryClient, getBigQueryScriptDrillsConfig } from "@/lib/bq/script-drills-insert";

type AuditAction =
  | "login_success"
  | "login_failed"
  | "logout"
  | "user_created"
  | "user_disabled"
  | "password_reset"
  | "password_changed"
  | "user_deleted";

type WriteAuditInput = {
  action: AuditAction;
  actorUsername: string;
  targetUsername?: string;
  ipAddress?: string;
  detail?: Record<string, unknown>;
};

function getAuditTable() {
  const { projectId, dataset } = getBigQueryScriptDrillsConfig();
  return `\`${projectId}.${dataset}.auth_audit_log\``;
}

export async function writeAuthAudit(input: WriteAuditInput): Promise<void> {
  const client = getBigQueryClient();
  const table = getAuditTable();
  const query = `
    INSERT INTO ${table}
    (audit_id, action, actor_username, target_username, ip_address, detail, created_at)
    VALUES (@auditId, @action, @actorUsername, @targetUsername, @ipAddress, @detail, CURRENT_TIMESTAMP())
  `;
  await client.query({
    query,
    params: {
      auditId: randomUUID(),
      action: input.action,
      actorUsername: input.actorUsername || "system",
      targetUsername: input.targetUsername ?? null,
      ipAddress: input.ipAddress ?? null,
      detail: JSON.stringify(input.detail ?? {}),
    },
  });
}
