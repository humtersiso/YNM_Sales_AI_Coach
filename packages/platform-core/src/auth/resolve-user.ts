import type { ApiUser } from "@ynm/contracts";

export type AuthMode = "api_key" | "jwt" | "disabled";

export function getAuthMode(): AuthMode {
  const mode = (process.env.YNM_API_AUTH_MODE ?? "api_key").toLowerCase();
  if (mode === "jwt") return "jwt";
  if (mode === "disabled") return "disabled";
  return "api_key";
}

function header(headers: Headers, name: string): string {
  return headers.get(name)?.trim() ?? "";
}

function userFromHeaders(headers: Headers): ApiUser | null {
  const userId = header(headers, "x-ynm-user-id");
  const username = header(headers, "x-ynm-username") || userId;
  if (!userId) return null;
  return {
    userId,
    username,
    displayName: header(headers, "x-ynm-display-name") || username,
    branch: header(headers, "x-ynm-branch"),
    role: header(headers, "x-ynm-role") === "admin" ? "admin" : "agent",
  };
}

function parseBearer(authHeader: string): string | null {
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

/** 簡易 JWT payload 解析（聯調用；正式環境建議換 JWKS 驗簽） */
function userFromJwt(token: string): ApiUser | null {
  const secret = process.env.YNM_JWT_SECRET?.trim();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub?: string;
      preferred_username?: string;
      name?: string;
      branch?: string;
      role?: string;
    };
    const userId = payload.sub?.trim();
    if (!userId) return null;
    const username = payload.preferred_username?.trim() || userId;
    return {
      userId,
      username,
      displayName: payload.name?.trim() || username,
      branch: payload.branch?.trim() ?? "",
      role: payload.role === "admin" ? "admin" : "agent",
    };
  } catch {
    return null;
  }
}

/**
 * 從 HTTP Headers 解析 API 使用者。
 * api_key：Bearer 須等於 YNM_API_KEY，身分由 X-YNM-* headers 提供。
 * jwt：Bearer JWT（payload 含 sub / branch）。
 * disabled：僅限本機，回傳固定 dev 使用者。
 */
export function resolveApiUser(headers: Headers): ApiUser | null {
  const mode = getAuthMode();

  if (mode === "disabled") {
    return {
      userId: "dev-user",
      username: "dev",
      displayName: "Dev Agent",
      branch: "HQ",
      role: "agent",
    };
  }

  const bearer = parseBearer(header(headers, "authorization"));
  if (!bearer) return null;

  if (mode === "api_key") {
    const expected = process.env.YNM_API_KEY?.trim();
    if (!expected || bearer !== expected) return null;
    return userFromHeaders(headers);
  }

  return userFromJwt(bearer);
}

export function toSessionUser(user: ApiUser) {
  return {
    userId: user.userId,
    username: user.username,
    displayName: user.displayName,
    branch: user.branch,
    role: user.role,
  };
}
