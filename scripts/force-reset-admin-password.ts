import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, isValidPasswordPolicy } from "../src/lib/auth/password";
import { findUserByUsername, resetPassword } from "../src/lib/bq/users";

function loadEnv() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnv();
  const username = (process.env.FORCE_ADMIN_USERNAME ?? "admin").trim();
  const nextPassword = (process.env.FORCE_ADMIN_PASSWORD ?? process.argv[2] ?? "").trim();
  if (!nextPassword) {
    throw new Error("請提供新密碼：設定 FORCE_ADMIN_PASSWORD 或執行 `npm run admin:reset-password -- NewPass123`");
  }
  if (!isValidPasswordPolicy(nextPassword)) {
    throw new Error("密碼不符合規則：至少 8 碼且含英數");
  }

  const user = await findUserByUsername(username);
  if (!user) {
    throw new Error(`找不到使用者：${username}`);
  }
  if (user.role !== "admin") {
    throw new Error(`${username} 不是管理員角色`);
  }

  const passwordHash = await hashPassword(nextPassword);
  await resetPassword(user.userId, passwordHash);
  console.log(`已重設管理員密碼：${username}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
