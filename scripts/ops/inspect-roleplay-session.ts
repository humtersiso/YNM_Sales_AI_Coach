/**
 * 查單場對練 transcript + correctionPoints
 * npx tsx scripts/ops/inspect-roleplay-session.ts <sessionId>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdminRoleplaySessionById } from "../../src/lib/bq/roleplay-sessions-bq";
import { getSession } from "../../src/lib/roleplay/engine/session-store";
import { detectCorrectionCandidates } from "../../src/lib/roleplay/engine/correction-builder";
import { coalesceAdjacentAgentTurns } from "../../src/lib/roleplay/engine/turn-coalesce";
import { composeScenarioFromConfig } from "../../src/lib/roleplay/engine/scenario-composer";
import { parseRoleplayTranscriptLines } from "../../src/lib/bq/roleplay-sessions-bq";
import type { RoleplayChatTurn } from "../../src/lib/roleplay/session-types";

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

function transcriptToTurns(lines: ReturnType<typeof parseRoleplayTranscriptLines>): RoleplayChatTurn[] {
  return lines.map((l) => ({
    role: l.role,
    content: l.content,
    at: l.at || new Date().toISOString(),
  }));
}

async function main() {
  loadEnv();
  const sessionId = process.argv[2]?.trim();
  if (!sessionId) {
    console.error("用法: npx tsx scripts/ops/inspect-roleplay-session.ts <sessionId>");
    process.exit(1);
  }

  console.log(`\n=== 場次 ${sessionId} ===\n`);

  const mem = getSession(sessionId);
  if (mem) {
    console.log("[記憶體] 找到場次");
    console.log(`  status=${mem.status} turns=${mem.turns.length}`);
    for (const t of mem.turns) {
      console.log(`  ${t.role === "customer" ? "客戶" : "業代"}：${t.content}`);
    }
    const cp = mem.scoreResult?.correctionPoints ?? [];
    console.log(`\n  correctionPoints: ${cp.length}`);
    for (const p of cp) {
      console.log(`    [${p.category}] ${p.issue}`);
    }
  } else {
    console.log("[記憶體] 無此場次（可能 dev 重啟）");
  }

  const bq = await getAdminRoleplaySessionById(sessionId);
  if (!bq) {
    console.log("\n[BQ] 找不到場次");
    return;
  }

  console.log(`\n[BQ] status=${bq.status} score=${bq.score} grade=${bq.grade}`);
  console.log(`  correctionPoints(stored): ${bq.correctionPoints.length}`);
  for (const p of bq.correctionPoints) {
    console.log(`    [${p.category ?? "?"}] ${p.issue}`);
  }

  if (bq.transcript) {
    console.log("\n[BQ transcript]");
    const lines = parseRoleplayTranscriptLines(bq.transcript);
    const turns = coalesceAdjacentAgentTurns(transcriptToTurns(lines));
    for (const l of lines) {
      console.log(`  ${l.role === "customer" ? "客戶" : "業代"}：${l.content}`);
    }

    const scenario = (
      await composeScenarioFromConfig({
        productLine: "xtrail-ice",
        personaId: (bq.personaId as "P-01") || "P-01",
        ageRange: (bq.ageRange as "30-40") || "30-40",
        competitor: bq.competitor || "Toyota RAV4",
        maxTurns: 5,
        difficulty: (bq.difficulty as "advanced") || "advanced",
      })
    ).scenario;

    const candidates = detectCorrectionCandidates(scenario, turns);
    console.log(`\n[規則重算] candidates=${candidates.length}`);
    for (const c of candidates) {
      console.log(`    [${c.category}] ${c.issue}`);
      console.log(`      客戶問: ${c.customerAsk.slice(0, 80)}`);
      console.log(`      業代說: ${c.whatYouSaid.slice(0, 80)}`);
    }
  }

  if (bq.reportJson) {
    try {
      const j = JSON.parse(bq.reportJson) as { correctionPoints?: unknown[] };
      console.log(`\n[report_json.correctionPoints] ${j.correctionPoints?.length ?? 0}`);
    } catch {
      console.log("\n[report_json] 解析失敗");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
