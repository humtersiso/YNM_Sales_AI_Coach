/**
 * 模擬真人對練 → 完整評分報告（含本場待加強）
 * npx tsx scripts/ops/test-roleplay-sim-report.ts
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
import { detectCorrectionCandidates } from "../../src/lib/roleplay/engine/correction-builder";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(webRoot, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
    }
    break;
  }
}

const SIM_USER: SessionUser = {
  userId: "sim-report-agent",
  username: "simreport",
  displayName: "模擬測試業代",
  branch: "測試據點",
  role: "agent",
};

/** 模擬業代先發 + 混合稱職／消極／薄弱回覆 */
const AGENT_SCRIPT = [
  "您好，在看這台車有什麼問題嗎？我都可以為您說明喔！",
  "我不知道欸，油耗這個可能要問一下同事。",
  "路上跑起來兩台差不多啦，您實際開過就懂。",
  "我們 WLTC 綜合約 16 km/L，十年 10 萬公里試算加車價折扣比 RAV4 省約 29 萬，週六方便帶您對試算表試乘嗎？",
  "好的，今天先了解到這裡也可以，有需要再聯絡我。",
];

function printReport(sr: NonNullable<Awaited<ReturnType<typeof finishRoleplaySession>>["scoreResult"]>) {
  console.log("\n════════ 評分報告 ════════");
  console.log(`總分：${sr.score} / 100　等級：${sr.grade}（${sr.gradeLabel}）`);
  console.log(`\n【評語】\n${sr.summary}`);
  console.log(`\n【建議】\n${sr.advice}`);
  console.log("\n【五維得分】");
  for (const d of sr.dimensions) {
    console.log(`  ${d.label}：${d.score} / ${d.maxScore ?? 20}`);
    console.log(`    ${d.comment}`);
  }
  const cp = sr.correctionPoints ?? [];
  console.log(`\n【本場待加強】共 ${cp.length} 項`);
  if (cp.length === 0) {
    console.log("  （無）");
    return;
  }
  const facts = cp.filter((p) => p.category === "fact");
  const strategy = cp.filter((p) => p.category === "strategy");
  if (facts.length) {
    console.log("\n  ■ 資訊對錯");
    for (const p of facts) {
      console.log(`    · ${p.issue}`);
      if (p.customerAsk) console.log(`      客戶問：${p.customerAsk}`);
      if (p.whatYouSaid) console.log(`      你的說法：${p.whatYouSaid}`);
      console.log(`      建議這樣說：${p.correctGuide}`);
    }
  }
  if (strategy.length) {
    console.log("\n  ■ 銷售策略");
    for (const p of strategy) {
      console.log(`    · ${p.issue}`);
      if (p.whatYouSaid) console.log(`      你的說法：${p.whatYouSaid}`);
      console.log(`      建議這樣說：${p.correctGuide}`);
    }
  }
}

async function main() {
  loadEnv();
  console.log("模擬真人對練（業代先發，含消極回覆）\n");

  const start = await startRoleplaySessionWithConfig({
    mode: "custom",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-01",
      ageRange: "30-40",
      competitor: "Toyota RAV4",
      maxTurns: 5,
      difficulty: "advanced",
    },
    user: SIM_USER,
  });

  console.log(`開局 session=${start.sessionId}`);
  console.log(`客戶開場（業代先發，第一輪後才顯示）：\n  ${start.customerMessage}\n`);

  let sid = start.sessionId;
  for (let i = 0; i < AGENT_SCRIPT.length; i += 1) {
    const msg = AGENT_SCRIPT[i]!;
    console.log(`--- 業代第 ${i + 1} 輪 ---`);
    console.log(`業代：${msg}`);
    const tr = await submitRoleplayTurn({ sessionId: sid, message: msg });
    console.log(`客戶：${tr.customerMessage}`);
    console.log(`（輪次 ${tr.turn}/${tr.maxTurns}）\n`);
    if (tr.shouldFinish) break;
  }

  const sessionBeforeFinish = await import("../../src/lib/roleplay/engine/session-store").then(
    (m) => m.getSession(sid),
  );
  if (sessionBeforeFinish) {
    const candidates = detectCorrectionCandidates(
      sessionBeforeFinish.scenario,
      sessionBeforeFinish.turns,
    );
    console.log(`規則候選（finish 前）：${candidates.length} 項`);
    for (const c of candidates) {
      console.log(`  [${c.category}] ${c.issue}`);
    }
  }

  console.log("--- 結束評分 ---");
  const fin = await finishRoleplaySession(sid);
  if (!fin.scoreResult) {
    console.error("評分失敗");
    process.exit(1);
  }
  printReport(fin.scoreResult);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
