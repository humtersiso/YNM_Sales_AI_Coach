import { randomUUID } from "node:crypto";
import { getBigQueryClient, getBigQueryScriptDrillsConfig } from "@/lib/bq/script-drills-insert";

export type PlatformUser = {
  userId: string;
  username: string;
  passwordHash: string;
  role: "admin" | "agent";
  displayName: string;
  branch: string;
  tenureYears: number;
  status: "active" | "disabled";
  lastLoginAt?: string | null;
  createdAt?: string | null;
  mustChangePassword: boolean;
};

type CreateUserInput = {
  username: string;
  passwordHash: string;
  role: "admin" | "agent";
  displayName: string;
  branch: string;
  tenureYears?: number;
  createdBy: string;
  mustChangePassword?: boolean;
};

function usersTable() {
  const { projectId, dataset } = getBigQueryScriptDrillsConfig();
  return `\`${projectId}.${dataset}.platform_users\``;
}

function mapRow(row: Record<string, unknown>): PlatformUser {
  return {
    userId: String(row.user_id ?? ""),
    username: String(row.username ?? ""),
    passwordHash: String(row.password_hash ?? ""),
    role: String(row.role ?? "agent") as "admin" | "agent",
    displayName: String(row.display_name ?? ""),
    branch: String(row.branch ?? ""),
    tenureYears: Number(row.tenure_years ?? 0),
    status: String(row.status ?? "active") as "active" | "disabled",
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    mustChangePassword: Boolean(row.must_change_password ?? false),
  };
}

export async function findUserByUsername(username: string): Promise<PlatformUser | null> {
  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: `
      SELECT *
      FROM ${usersTable()}
      WHERE username = @username
      LIMIT 1
    `,
    params: { username: username.trim() },
  });
  if (!rows.length) return null;
  return mapRow(rows[0] as Record<string, unknown>);
}

/** 登入用：只查必要欄位，減少 BQ 傳輸量 */
export async function findUserForLogin(username: string): Promise<PlatformUser | null> {
  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: `
      SELECT
        user_id,
        username,
        password_hash,
        role,
        display_name,
        branch,
        tenure_years,
        status,
        must_change_password
      FROM ${usersTable()}
      WHERE username = @username
      LIMIT 1
    `,
    params: { username: username.trim() },
  });
  if (!rows.length) return null;
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function findUserById(userId: string): Promise<PlatformUser | null> {
  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: `
      SELECT *
      FROM ${usersTable()}
      WHERE user_id = @userId
      LIMIT 1
    `,
    params: { userId },
  });
  if (!rows.length) return null;
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function countActiveAdmins(): Promise<number> {
  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: `
      SELECT COUNT(*) AS n
      FROM ${usersTable()}
      WHERE role = 'admin' AND status = 'active'
    `,
  });
  return Number((rows[0] as { n?: number })?.n ?? 0);
}

export async function listUsers(filters?: {
  role?: "admin" | "agent";
  branch?: string;
  status?: "active" | "disabled";
  q?: string;
}): Promise<PlatformUser[]> {
  const client = getBigQueryClient();
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters?.role) {
    clauses.push("role = @role");
    params.role = filters.role;
  }
  if (filters?.branch) {
    clauses.push("branch = @branch");
    params.branch = filters.branch;
  }
  if (filters?.status) {
    clauses.push("status = @status");
    params.status = filters.status;
  }
  if (filters?.q) {
    clauses.push("(username LIKE @q OR display_name LIKE @q)");
    params.q = `%${filters.q}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [rows] = await client.query({
    query: `
      SELECT *
      FROM ${usersTable()}
      ${where}
      ORDER BY created_at DESC
      LIMIT 500
    `,
    params,
  });
  return (rows as Record<string, unknown>[]).map(mapRow);
}

export async function createUser(input: CreateUserInput): Promise<PlatformUser> {
  const exists = await findUserByUsername(input.username);
  if (exists) {
    throw new Error("帳號已存在");
  }
  const client = getBigQueryClient();
  const userId = randomUUID();
  await client.query({
    query: `
      INSERT INTO ${usersTable()}
      (user_id, username, password_hash, role, display_name, branch, tenure_years, status, must_change_password, created_at, updated_at, created_by)
      VALUES
      (@userId, @username, @passwordHash, @role, @displayName, @branch, @tenureYears, 'active', @mustChangePassword, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @createdBy)
    `,
    params: {
      userId,
      username: input.username.trim(),
      passwordHash: input.passwordHash,
      role: input.role,
      displayName: input.displayName.trim(),
      branch: input.branch.trim(),
      tenureYears: input.tenureYears ?? 0,
      createdBy: input.createdBy,
      mustChangePassword: input.mustChangePassword ?? (input.role === "agent"),
    },
  });

  const created = await findUserByUsername(input.username);
  if (!created) throw new Error("建立使用者失敗");
  return created;
}

export async function updateUser(userId: string, patch: {
  displayName?: string;
  branch?: string;
  tenureYears?: number;
  status?: "active" | "disabled";
}): Promise<void> {
  const sets: string[] = ["updated_at = CURRENT_TIMESTAMP()"];
  const params: Record<string, unknown> = { userId };
  if (patch.displayName != null) {
    sets.push("display_name = @displayName");
    params.displayName = patch.displayName.trim();
  }
  if (patch.branch != null) {
    sets.push("branch = @branch");
    params.branch = patch.branch.trim();
  }
  if (patch.tenureYears != null) {
    sets.push("tenure_years = @tenureYears");
    params.tenureYears = patch.tenureYears;
  }
  if (patch.status != null) {
    sets.push("status = @status");
    params.status = patch.status;
  }
  const client = getBigQueryClient();
  await client.query({
    query: `
      UPDATE ${usersTable()}
      SET ${sets.join(", ")}
      WHERE user_id = @userId
    `,
    params,
  });
}

export async function resetPassword(userId: string, passwordHash: string): Promise<void> {
  const client = getBigQueryClient();
  await client.query({
    query: `
      UPDATE ${usersTable()}
      SET password_hash = @passwordHash, must_change_password = TRUE, updated_at = CURRENT_TIMESTAMP()
      WHERE user_id = @userId
    `,
    params: { userId, passwordHash },
  });
}

export async function changePassword(userId: string, passwordHash: string): Promise<void> {
  const client = getBigQueryClient();
  await client.query({
    query: `
      UPDATE ${usersTable()}
      SET password_hash = @passwordHash, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP()
      WHERE user_id = @userId
    `,
    params: { userId, passwordHash },
  });
}

export async function markLoginSuccess(userId: string): Promise<void> {
  const client = getBigQueryClient();
  await client.query({
    query: `
      UPDATE ${usersTable()}
      SET last_login_at = CURRENT_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP()
      WHERE user_id = @userId
    `,
    params: { userId },
  });
}

export async function deleteUser(userId: string): Promise<void> {
  const client = getBigQueryClient();
  await client.query({
    query: `
      DELETE FROM ${usersTable()}
      WHERE user_id = @userId
    `,
    params: { userId },
  });
}
