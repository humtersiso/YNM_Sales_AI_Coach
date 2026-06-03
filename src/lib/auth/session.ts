import { createHmac } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "ynm_session";
const SALES_COOKIE_NAME = "ynm_sales_session";
const EXPIRE_HOURS = 8;

export type AppRole = "admin" | "agent";
export type SessionUser = {
  userId: string;
  username: string;
  displayName: string;
  branch?: string;
  role: AppRole;
  mustChangePassword?: boolean;
};

function secret() {
  return process.env.AUTH_SESSION_SECRET || "dev-ynm-session-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function buildToken(user: SessionUser, expiresAt: number) {
  const branch = user.branch ?? "";
  const mustChangePassword = user.mustChangePassword ? "1" : "0";
  const payload = `${user.userId}|${user.username}|${user.displayName}|${branch}|${user.role}|${mustChangePassword}|${expiresAt}`;
  return `${payload}|${sign(payload)}`;
}

function parseToken(raw: string): SessionUser | null {
  const parts = raw.split("|");
  if (parts.length !== 7 && parts.length !== 8) return null;
  const isNewVersion = parts.length === 8;
  const [userId, username, displayName, branch, role] = parts;
  const mustChangePasswordText = isNewVersion ? parts[5] : "0";
  const expiresAtText = isNewVersion ? parts[6] : parts[5];
  const sig = isNewVersion ? parts[7] : parts[6];
  const payload = isNewVersion
    ? `${userId}|${username}|${displayName}|${branch}|${role}|${mustChangePasswordText}|${expiresAtText}`
    : `${userId}|${username}|${displayName}|${branch}|${role}|${expiresAtText}`;
  if (sign(payload) !== sig) return null;
  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  if (role !== "admin" && role !== "agent") return null;
  return {
    userId,
    username,
    displayName,
    branch: branch || undefined,
    role,
    mustChangePassword: mustChangePasswordText === "1",
  };
}

async function setCookie(name: string, user: SessionUser) {
  const expiresAt = Date.now() + EXPIRE_HOURS * 60 * 60 * 1000;
  const token = buildToken(user, expiresAt);
  const jar = await cookies();
  jar.set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

async function clearCookie(name: string) {
  const jar = await cookies();
  jar.delete(name);
}

async function readCookie(name: string): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(name)?.value;
  if (!raw) return null;
  return parseToken(raw);
}

export async function setAdminSession(user: Omit<SessionUser, "role">) {
  await setCookie(ADMIN_COOKIE_NAME, { ...user, role: "admin" });
}

export async function setSalesSession(user: Omit<SessionUser, "role">) {
  await setCookie(SALES_COOKIE_NAME, { ...user, role: "agent" });
}

export async function clearSession() {
  await clearCookie(ADMIN_COOKIE_NAME);
}

export async function clearSalesSession() {
  await clearCookie(SALES_COOKIE_NAME);
}

export async function readSession(): Promise<SessionUser | null> {
  const user = await readCookie(ADMIN_COOKIE_NAME);
  return user?.role === "admin" ? user : null;
}

export async function readSalesSession(): Promise<SessionUser | null> {
  const user = await readCookie(SALES_COOKIE_NAME);
  return user?.role === "agent" ? user : null;
}

export const SESSION_COOKIE_NAME = ADMIN_COOKIE_NAME;
export const SALES_SESSION_COOKIE_NAME = SALES_COOKIE_NAME;

