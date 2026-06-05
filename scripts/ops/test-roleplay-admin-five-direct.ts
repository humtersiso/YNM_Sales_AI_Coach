/**
 * 以 admin 身分直接跑 5 場不同情境（不需 dev server）
 * 用法：npx tsx scripts/ops/test-roleplay-admin-five-direct.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionUser } from "../../src/lib/auth/session";
import {
  finishRoleplaySession,
  startRoleplaySessionWithConfig,
  submitRoleplayTurn,
} from "../../src/lib/roleplay/engine/session-service";
import { getAgentDashboardStats, getAgentHistory } from "../../src/lib/roleplay/stats-service";
import type { RoleplaySessionConfig } from "../../src/lib/roleplay/scenario-contract";
import { getRoleplayFunnelSummary } from "../../src/lib/bq/roleplay-sessions-bq";
import { findUserByUsername } from "../../src/lib/bq/users";

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

async function resolveAdminUser(): Promise<SessionUser> {
  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const row = await findUserByUsername(username);
  if (row) {
    return {
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      branch: row.branch,
      role: "admin",
    };
  }
  return {
    userId: "admin-seed-user",
    username,
    displayName: process.env.SEED_ADMIN_DISPLAY_NAME ?? "系統管理員",
    branch: process.env.SEED_ADMIN_BRANCH ?? "總部",
    role: "admin",
  };
}

const SCENARIOS: { label: string; config: RoleplaySessionConfig }[] = [
  {
    label: "P-01 新手 vs RAV4",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-01",
      ageRange: "30-40",
      competitor: "Toyota RAV4",
      maxTurns: 3,
      difficulty: "beginner",
    },
  },
  {
    label: "P-02 進階 vs CR-V",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-02",
      ageRange: "20-30",
      competitor: "Honda CR-V",
      maxTurns: 4,
      difficulty: "advanced",
    },
  },
  {
    label: "P-03 挑戰 vs Tucson",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-03",
      ageRange: "40-50",
      competitor: "Hyundai Tucson L",
      maxTurns: 4,
      difficulty: "challenge",
    },
  },
  {
    label: "P-04 進階 vs Outlander",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-04",
      ageRange: "50+",
      competitor: "Mitsubishi Outlander",
      maxTurns: 3,
      difficulty: "advanced",
    },
  },
  {
    label: "P-05 挑戰 vs RAV4",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-05",
      ageRange: "30-40",
      competitor: "Toyota RAV4",
      maxTurns: 5,
      difficulty: "challenge",
    },
  },
];

const REPLIES = [
  "我理解您在意油耗，X-TRAIL ICE 在 WLTC 約 14km/L，可依年里程試算。",
  "同級還有 ProPILOT 與空間優勢，建議安排試乘比較體感。",
  "若預算允許，可搭配保固與分期方案，讓月付更清楚。",
];

async function runOne(
  admin: SessionUser,
  scenario: (typeof SCENARIOS)[0],
  index: number,
) {
  console.log(`\n[${index + 1}/5] ${scenario.label}（admin: ${admin.username} / ${admin.userId}）`);
  const start = await startRoleplaySessionWithConfig({
    mode: "custom",
    config: scenario.config,
    user: admin,
  });
  console.log(`  Gate1 session=${start.sessionId}`);
  console.log(`  開場：${start.customerMessage.slice(0, 80)}…`);

  let sid = start.sessionId;
  const turns = Math.min(2, scenario.config.maxTurns);
  for (let i = 0; i < turns; i += 1) {
    const tr = await submitRoleplayTurn({
      sessionId: sid,
      message: REPLIES[i % REPLIES.length],
    });
    console.log(`  輪 ${tr.turn} 客戶：${tr.customerMessage.slice(0, 60)}…`);
    if (tr.shouldFinish) break;
  }

  const fin = await finishRoleplaySession(sid);
  const sr = fin.scoreResult;
  if (!sr) throw new Error("無評分");
  console.log(`  Gate2 ${sr.score}/100 · ${sr.grade}`);
  console.log(`  五維：${sr.dimensions.map((d) => `${d.label}${d.score}`).join(" · ")}`);
  if (sr.improvementTips.length) console.log(`  建議：${sr.improvementTips[0].slice(0, 60)}…`);
  return sr.score;
}

async function main() {
  loadEnv();
  const admin = await resolveAdminUser();
  console.log("Admin 五情境對練（直接 API + BQ）\n");
  console.log(`登入身分：${admin.displayName} (${admin.userId})\n`);

  const scores: number[] = [];
  for (let i = 0; i < SCENARIOS.length; i++) {
    try {
      scores.push(await runOne(admin, SCENARIOS[i], i));
    } catch (e) {
      console.error(`  ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n--- 完成 ${scores.length}/5 場 ---`);

  await new Promise((r) => setTimeout(r, 3000));
  const funnel = await getRoleplayFunnelSummary({ days: 7 });
  console.log(`漏斗 BQ：STARTED=${funnel.started} COMPLETED=${funnel.completed}`);

  const stats = await getAgentDashboardStats(admin.userId);
  console.log(`戰績：場次=${stats.totalSessions} 均分=${stats.overallAvg} 最近=${stats.lastScore}`);

  const hist = await getAgentHistory(admin.userId, 5);
  console.log(`歷史：${hist.length} 筆，最新 ${hist[0]?.targetModel ?? "-"} ${hist[0]?.score ?? "-"} 分`);

  process.exitCode = scores.length === 5 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
