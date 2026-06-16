import type { ApiUser } from "@ynm/contracts";
import { resolveApiUser } from "@ynm/platform-core";
import type { Context, Next } from "hono";

export type AuthVariables = {
  user: ApiUser;
};

export async function requireAuth(c: Context<{ Variables: AuthVariables }>, next: Next) {
  const user = resolveApiUser(c.req.raw.headers);
  if (!user) {
    return c.json({ error: "未授權" }, 401);
  }
  c.set("user", user);
  await next();
}
