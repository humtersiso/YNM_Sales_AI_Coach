/**
 * 銷售助手完整驗收（發版前跑這支）
 * npm run test:sales-chat:all
 * npm run test:sales-chat:all -- --rounds=3
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const roundsArg = process.argv.find((a) => a.startsWith("--rounds="));
const rounds = roundsArg ?? "--rounds=3";

const steps: { name: string; cmd: string; args: string[] }[] = [
  { name: "chunk-search-text", cmd: "npm", args: ["run", "test:chunk-search-text"] },
  { name: "query-relevance-guard", cmd: "npx", args: ["tsx", "scripts/test-query-relevance-guard.ts"] },
  { name: "spec-retrieval", cmd: "npm", args: ["run", "test:spec-retrieval"] },
  { name: "retrieval-recall", cmd: "npm", args: ["run", "test:retrieval", "--", "--threshold=0.88"] },
  { name: "query-relevance-vehicles", cmd: "npx", args: ["tsx", "scripts/test-query-relevance-vehicles.ts"] },
  { name: "sales-chat-suite", cmd: "npm", args: ["run", "test:sales-chat:suite", "--", rounds] },
];

let failed = 0;
console.log("=== 銷售助手完整驗收 ===\n");

for (const step of steps) {
  console.log(`--- ${step.name} ---`);
  const r = spawnSync(step.cmd, step.args, { cwd: webRoot, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    failed += 1;
    console.error(`FAILED: ${step.name}\n`);
  } else {
    console.log(`PASSED: ${step.name}\n`);
  }
}

if (failed) {
  console.error(`${failed}/${steps.length} step(s) failed.`);
  process.exit(1);
}
console.log(`All ${steps.length} steps passed.`);
