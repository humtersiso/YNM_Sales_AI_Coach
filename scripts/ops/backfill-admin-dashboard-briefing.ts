/**
 * 為 admin 預先產生首頁小結並寫入 roleplay_agent_dashboard
 * 用法：npx tsx scripts/ops/backfill-admin-dashboard-briefing.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureRoleplayAgentDashboardTable,
  getAgentDashboardRow,
} from "../../src/lib/bq/roleplay-agent-dashboard-bq";
import { findUserByUsername } from "../../src/lib/bq/users";
import { refreshAgentDashboardBriefing } from "../../src/lib/roleplay/agent-dashboard-briefing-service";
import { getAgentDashboardStats } from "../../src/lib/roleplay/stats-service";
import { listCompletedSessionsDetail } from "../../src/lib/bq/roleplay-sessions-bq";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(webRoot, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    break;
  }
}

async function main() {
  loadEnv();
  const username = (process.env.SEED_ADMIN_USERNAME ?? "admin").trim();
  const row = await findUserByUsername(username);
  if (!row) {
    console.error(`找不到 BQ 使用者：${username}，請先 seed admin`);
    process.exit(1);
  }

  const userId = row.userId;
  console.log(`admin userId: ${userId} (${row.username})`);

  const completed = await listCompletedSessionsDetail(userId, 5);
  console.log(`完賽場次（BQ）: ${completed.length}`);
  if (completed.length === 0) {
    console.warn("admin 尚無 COMPLETED 場次，小結會依 started 產生簡版");
  }

  await ensureRoleplayAgentDashboardTable();
  console.log("roleplay_agent_dashboard 表已就緒");

  const lastSessionId = completed[0]?.sessionId ?? "admin-backfill";
  await refreshAgentDashboardBriefing(userId, {
    trigger: "gate2",
    sessionId: lastSessionId,
  });

  const saved = await getAgentDashboardRow(userId);
  const stats = await getAgentDashboardStats(userId);

  if (!saved?.briefing) {
    console.error("寫入失敗：BQ 仍無 briefing");
    process.exit(1);
  }

  console.log("\n--- 已寫入 BQ ---");
  console.log("fingerprint:", saved.statsFingerprint);
  console.log("strength:", saved.briefing.strengthLine);
  console.log("weakness:", saved.briefing.weaknessLine);
  console.log("trend:", saved.briefing.trendLine);
  console.log("advice:", saved.briefing.adviceLine);
  if (saved.briefing.knowledgeLines?.length) {
    console.log("knowledge:");
    for (const line of saved.briefing.knowledgeLines) {
      console.log(" -", line);
    }
  }
  console.log("\n首頁 stats.briefing:", stats.briefing ? "OK" : "null");
  console.log("briefingStale:", stats.briefingStale ?? false);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
