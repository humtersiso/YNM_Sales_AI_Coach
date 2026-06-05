import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findUserByUsername } from "../../src/lib/bq/users";

function loadEnv() {
  const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function main() {
  loadEnv();
  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const u = await findUserByUsername(username);
  if (!u) {
    console.error(`找不到使用者：${username}`);
    process.exit(1);
  }
  console.log(u.userId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
