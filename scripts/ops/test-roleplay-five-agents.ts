/**
 * 模擬 5 位業代、5 種情境（含 1 場只開局未完賽 → 漏斗 STARTED 無 COMPLETED）
 * 用法：npx tsx scripts/ops/test-roleplay-five-agents.ts
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
import type { RoleplaySessionConfig } from "../../src/lib/roleplay/scenario-contract";
import { getRoleplayFunnelSummary } from "../../src/lib/bq/roleplay-sessions-bq";

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

const AGENTS: { label: string; user: SessionUser; config: RoleplaySessionConfig; abandon?: boolean }[] = [
  {
    label: "業代甲（P-01 新手 vs RAV4）",
    user: { userId: "sim-agent-01", username: "sim01", displayName: "模擬業代甲", branch: "北區一店", role: "agent" },
    config: { productLine: "xtrail-ice", personaId: "P-01", ageRange: "30-40", competitor: "Toyota RAV4", maxTurns: 3, difficulty: "beginner" },
  },
  {
    label: "業代乙（P-02 進階 vs CR-V）",
    user: { userId: "sim-agent-02", username: "sim02", displayName: "模擬業代乙", branch: "北區二店", role: "agent" },
    config: { productLine: "xtrail-ice", personaId: "P-02", ageRange: "20-30", competitor: "Honda CR-V", maxTurns: 4, difficulty: "advanced" },
  },
  {
    label: "業代丙（P-03 挑戰 vs Tucson）",
    user: { userId: "sim-agent-03", username: "sim03", displayName: "模擬業代丙", branch: "南區一店", role: "agent" },
    config: { productLine: "xtrail-ice", personaId: "P-03", ageRange: "40-50", competitor: "Hyundai Tucson L", maxTurns: 5, difficulty: "challenge" },
  },
  {
    label: "業代丁（P-04 新手 — 只開局放棄）",
    user: { userId: "sim-agent-04", username: "sim04", displayName: "模擬業代丁", branch: "南區二店", role: "agent" },
    config: { productLine: "xtrail-ice", personaId: "P-04", ageRange: "50+", competitor: "Toyota RAV4", maxTurns: 5, difficulty: "beginner" },
    abandon: true,
  },
  {
    label: "業代戊（P-05 挑戰 vs RAV4）",
    user: { userId: "sim-agent-05", username: "sim05", displayName: "模擬業代戊", branch: "中部旗艦", role: "agent" },
    config: { productLine: "xtrail-ice", personaId: "P-05", ageRange: "30-40", competitor: "Toyota RAV4", maxTurns: 4, difficulty: "challenge" },
  },
];

const SAMPLE_REPLIES = [
  "我理解您會比較油耗，這在 WLTC 基準下我們約 14km/L 等級，實際還要看您的年里程。",
  "除了油耗，X-TRAIL 的 ProPILOT 與空間在同級也很有競爭力，要不要安排試乘體驗？",
  "我可以幫您用年里程和油價做試算，讓數字更具體。",
];

async function runOne(agent: (typeof AGENTS)[0]) {
  console.log(`\n=== ${agent.label} ===`);
  const start = await startRoleplaySessionWithConfig({
    mode: "custom",
    config: agent.config,
    user: agent.user,
  });
  console.log(`  Gate1 OK session=${start.sessionId}`);
  console.log(`  開場：${start.customerMessage.slice(0, 80)}…`);

  if (agent.abandon) {
    console.log("  （刻意不評分 → 僅 STARTED，供漏斗流失分析）");
    return { ok: true, abandoned: true };
  }

  let sid = start.sessionId;
  const turns = Math.min(2, agent.config.maxTurns);
  for (let i = 0; i < turns; i += 1) {
    const reply = SAMPLE_REPLIES[i % SAMPLE_REPLIES.length];
    const tr = await submitRoleplayTurn({ sessionId: sid, message: reply });
    console.log(`  輪 ${tr.turn} 客戶：${tr.customerMessage.slice(0, 60)}…`);
    if (tr.shouldFinish) break;
  }

  const fin = await finishRoleplaySession(sid);
  const sr = fin.scoreResult;
  if (!sr) {
    console.log("  FAIL 無評分");
    return { ok: false };
  }
  console.log(`  Gate2 OK 總分 ${sr.score}/100 等級 ${sr.grade}`);
  console.log(
    `  五維：${sr.dimensions.map((d) => `${d.label}${d.score}`).join(" · ")}`,
  );
  return { ok: true, score: sr.score };
}

async function main() {
  loadEnv();
  console.log("對練 Five-Agent 煙測（Two-Gate BQ + 記憶體 fallback）\n");

  const results = [];
  for (const a of AGENTS) {
    try {
      results.push(await runOne(a));
    } catch (e) {
      console.error(`  ERROR: ${e instanceof Error ? e.message : e}`);
      results.push({ ok: false });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n--- 摘要：${ok}/${AGENTS.length} 場流程成功 ---`);

  await new Promise((r) => setTimeout(r, 2000));
  const funnel = await getRoleplayFunnelSummary({ days: 7 });
  console.log(`漏斗（近 7 日 BQ）：STARTED=${funnel.started} COMPLETED=${funnel.completed} 流失=${funnel.dropoff}`);

  process.exitCode = ok >= 4 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
