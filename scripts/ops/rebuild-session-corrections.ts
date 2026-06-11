/**
 * 依 sessionId 從 BQ 拉 transcript 重算待加強
 * npx tsx scripts/ops/rebuild-session-corrections.ts <sessionId>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdminRoleplaySessionById } from "../../src/lib/bq/roleplay-sessions-bq";
import { rebuildCorrectionsFromTranscript } from "../../src/lib/roleplay/engine/correction-builder";

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

loadEnv();

async function main() {
  const sessionId = process.argv[2]?.trim();
  if (!sessionId) {
    console.error("用法: npx tsx scripts/ops/rebuild-session-corrections.ts <sessionId>");
    process.exit(1);
  }

  const detail = await getAdminRoleplaySessionById(sessionId);
  if (!detail?.transcript?.trim()) {
    console.error("找不到場次或無 transcript:", sessionId);
    process.exit(1);
  }

  console.log(`場次: ${detail.sessionId}`);
  console.log(`業代: ${detail.username} | 競品: ${detail.competitor} | 車型: ${detail.targetModel}`);
  console.log(`分數: ${detail.score} | 完成: ${detail.finishedAt}\n`);

  const points = await rebuildCorrectionsFromTranscript({
    transcript: detail.transcript,
    competitor: detail.competitor,
    targetModel: detail.targetModel,
    difficulty: String(detail.difficulty),
    ageRange: detail.ageRange,
    facts: detail.scenarioFacts,
  });

  console.log(`待加強 ${points.length} 項:\n`);
  for (const [i, p] of points.entries()) {
    console.log(`${i + 1}. [${p.category}] ${p.issue}`);
    if (p.customerAsk) console.log(`   客戶問: ${p.customerAsk.slice(0, 120)}…`);
    if (p.whatYouSaid) console.log(`   你的說法: ${p.whatYouSaid.slice(0, 120)}…`);
    console.log(`   建議: ${p.correctGuide}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
