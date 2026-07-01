import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createUser, findUserByUsername } from "../src/lib/bq/users";
import { hashPassword, isValidPasswordPolicy } from "../src/lib/auth/password";

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
  const username = (process.env.SEED_SUPER_ADMIN_USERNAME ?? "superadmin").trim();
  const displayName = (process.env.SEED_SUPER_ADMIN_DISPLAY_NAME ?? "Super Admin").trim();
  const branch = (process.env.SEED_SUPER_ADMIN_BRANCH ?? "總部").trim();
  const password = (process.env.SEED_SUPER_ADMIN_PASSWORD ?? "").trim();
  if (!password) {
    throw new Error("請設定 SEED_SUPER_ADMIN_PASSWORD");
  }
  if (!isValidPasswordPolicy(password)) {
    throw new Error("SEED_SUPER_ADMIN_PASSWORD 不符合規則（至少 8 碼且含英數）");
  }

  const exists = await findUserByUsername(username);
  if (exists) {
    if (exists.role === "super_admin") {
      console.log(`Super admin 已存在：${username}`);
      return;
    }
    throw new Error(`帳號 ${username} 已存在但角色為 ${exists.role}，請改用其他帳號名稱`);
  }

  const passwordHash = await hashPassword(password);
  await createUser({
    username,
    displayName,
    branch,
    role: "super_admin",
    tenureYears: 0,
    passwordHash,
    createdBy: "seed-super-admin",
    mustChangePassword: false,
  });
  console.log(`已建立 super admin：${username}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
