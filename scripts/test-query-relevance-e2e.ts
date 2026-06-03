/**
 * 端到端：chatWithDataAgent 對 UFO / 正常問題
 * 需 .env 內 BQ + Gemini。執行：npx tsx scripts/test-query-relevance-e2e.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

import { chatWithDataAgent } from "../src/lib/gemini/conversational-analytics";

const cases = [
  { q: "UFO 01 跟  X-TRAIL的差異", mustBlock: true },
  { q: "UFO 01 呢?", mustBlock: true },
  { q: "XTRAIL 特色如何?", mustBlock: false },
];

async function main() {
  let failed = 0;
  for (const c of cases) {
    console.log(`\n--- Q: ${c.q} ---`);
    try {
      const r = await chatWithDataAgent(c.q);
      const blocked = !r.inQuestionBank && r.citations.length === 0;
      const hasXtrailPitch =
        /油耗|雙層隔音|ProPILOT|VC-TURBO|647/.test(r.reply) ||
        r.bullets.some((b) => /油耗|隔音|行李廂/.test(b));

      console.log(`inQuestionBank=${r.inQuestionBank} citations=${r.citations.length}`);
      console.log(`reply: ${r.reply.slice(0, 120)}…`);

      if (c.mustBlock) {
        if (!blocked) {
          console.log("FAIL: expected blocked (no bank answer)");
          failed += 1;
        } else if (hasXtrailPitch) {
          console.log("FAIL: blocked but still sounds like X-TRAIL pitch");
          failed += 1;
        } else {
          console.log("PASS: blocked appropriately");
        }
      } else {
        if (blocked) {
          console.log("FAIL: expected normal answer");
          failed += 1;
        } else {
          console.log("PASS: got knowledge answer");
        }
      }
    } catch (e) {
      console.log("ERROR:", e instanceof Error ? e.message : e);
      failed += 1;
    }
  }
  console.log(failed === 0 ? "\nE2E all passed." : `\n${failed} E2E failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
