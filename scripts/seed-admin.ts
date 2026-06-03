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
  const username = (process.env.SEED_ADMIN_USERNAME ?? "admin").trim();
  const displayName = (process.env.SEED_ADMIN_DISPLAY_NAME ?? "系統管理員").trim();
  const branch = (process.env.SEED_ADMIN_BRANCH ?? "總部").trim();
  const password = (process.env.SEED_ADMIN_PASSWORD ?? "").trim();
  if (!password) {
    throw new Error("請設定 SEED_ADMIN_PASSWORD");
  }
  if (!isValidPasswordPolicy(password)) {
    throw new Error("SEED_ADMIN_PASSWORD 不符合規則（至少 8 碼且含英數）");
  }
  const exists = await findUserByUsername(username);
  if (exists) {
    console.log(`管理員已存在：${username}`);
    return;
  }
  const passwordHash = await hashPassword(password);
  await createUser({
    username,
    displayName,
    branch,
    role: "admin",
    tenureYears: 0,
    passwordHash,
    createdBy: "seed-admin",
  });
  console.log(`已建立管理員：${username}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
