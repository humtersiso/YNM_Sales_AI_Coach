import { createHmac } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "ynm_session";
const EXPIRE_HOURS = 8;

function secret() {
  return process.env.AUTH_SESSION_SECRET || "dev-ynm-session-secret";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export type SessionUser = { username: string; displayName: string };

export async function setSession(user: SessionUser) {
  const expiresAt = Date.now() + EXPIRE_HOURS * 60 * 60 * 1000;
  const payload = `${user.username}|${user.displayName}|${expiresAt}`;
  const token = `${payload}|${sign(payload)}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function readSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const parts = raw.split("|");
  if (parts.length < 4) return null;
  const [username, displayName, expiresAtText, sig] = parts;
  const payload = `${username}|${displayName}|${expiresAtText}`;
  if (sign(payload) !== sig) return null;
  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return { username, displayName };
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

