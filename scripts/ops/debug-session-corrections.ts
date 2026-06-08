import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAdminRoleplaySessionById, parseRoleplayTranscriptLines } from "../../src/lib/bq/roleplay-sessions-bq";
import { coalesceAdjacentAgentTurns } from "../../src/lib/roleplay/engine/turn-coalesce";
import { detectCorrectionCandidates } from "../../src/lib/roleplay/engine/correction-builder";
import type { RoleplayScenario } from "../../src/lib/roleplay/scenario-contract";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
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

const mockScenario = {
  sectionA: { competitor: "Tucson", productDisplayName: "X-TRAIL", title: "test", coreIssue: "成本", productLine: "xtrail-ice" },
  sectionB: { openingLine: "", followUps: [] },
  sectionC: { facts: [{ label: "成本", value: "十年試算" }] },
  sectionD: { closingActions: ["試乘"] },
  sectionE: { difficulty: "advanced", ageRange: "30-40" },
} as unknown as RoleplayScenario;

async function main() {
const sessionId = process.argv[2] ?? "c0653b11-5e9a-4079-993f-712fe6a20287";
const bq = await getAdminRoleplaySessionById(sessionId);
if (!bq?.transcript) {
  console.log("no transcript");
  process.exit(1);
}

const lines = parseRoleplayTranscriptLines(bq.transcript);
const turns = coalesceAdjacentAgentTurns(
  lines.map((l) => ({ role: l.role, content: l.content, at: l.at || "" })),
);
console.log("coalesced", turns.length);
for (let i = 0; i < turns.length; i++) {
  const t = turns[i]!;
  console.log(`${i} ${t.role}: ${t.content.slice(0, 70).replace(/\n/g, " | ")}`);
}
const c = detectCorrectionCandidates(mockScenario, turns);
console.log("\ncandidates", c.length);
for (const x of c) console.log(` [${x.category}] ${x.issue}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
