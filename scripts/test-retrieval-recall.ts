/**
 * 檢索 recall 評測（recall@5 / recall@10 / MRR）
 * 用法：npm run test:retrieval
 *       npx tsx scripts/test-retrieval-recall.ts --threshold=0.90
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScoredKnowledgeHit } from "../src/lib/gemini/knowledge-search";
import { searchKnowledgeHitsByPlan } from "../src/lib/gemini/knowledge-search-planned";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";

type RetrievalGoldCase = {
  id: string;
  query: string;
  expectQuestionContains?: string;
  expectScriptContains?: string;
  expectSourceLocator?: string;
  productLine?: string;
  materialCategory?: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function loadGoldCases(): RetrievalGoldCase[] {
  const goldPath = path.join(webRoot, "data", "retrieval-gold.json");
  const manualPath = path.join(webRoot, "data", "retrieval-gold-manual.json");

  const merged: RetrievalGoldCase[] = [];
  if (fs.existsSync(manualPath)) {
    merged.push(...(JSON.parse(fs.readFileSync(manualPath, "utf8")) as RetrievalGoldCase[]));
  }
  if (fs.existsSync(goldPath)) {
    const data = JSON.parse(fs.readFileSync(goldPath, "utf8")) as {
      cases?: RetrievalGoldCase[];
    };
    if (data.cases?.length) merged.push(...data.cases);
  }
  if (merged.length) {
    const byId = new Map<string, RetrievalGoldCase>();
    for (const c of merged) byId.set(c.id, c);
    return [...byId.values()];
  }
  return [];
}

function hitMatches(caseItem: RetrievalGoldCase, hit: ScoredKnowledgeHit): boolean {
  const q = hit.customer_question?.toLowerCase() ?? "";
  const script = (hit.standard_script ?? "").toLowerCase();
  const expectQ = caseItem.expectQuestionContains?.toLowerCase() ?? "";
  if (expectQ && q.includes(expectQ)) return true;
  const expectS = caseItem.expectScriptContains?.toLowerCase() ?? "";
  if (expectS && (script.includes(expectS) || q.includes(expectS))) return true;
  if (caseItem.expectSourceLocator && hit.source_locator === caseItem.expectSourceLocator) {
    return true;
  }
  return false;
}

function recallAtK(hits: ScoredKnowledgeHit[], caseItem: RetrievalGoldCase, k: number): boolean {
  return hits.slice(0, k).some((h) => hitMatches(caseItem, h));
}

function mrr(hits: ScoredKnowledgeHit[], caseItem: RetrievalGoldCase): number {
  const idx = hits.findIndex((h) => hitMatches(caseItem, h));
  return idx >= 0 ? 1 / (idx + 1) : 0;
}

async function main() {
  loadEnv();

  const thresholdArg = process.argv.find((a) => a.startsWith("--threshold="));
  const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 0.95;

  const cases = loadGoldCases();
  if (cases.length === 0) {
    console.error("No gold cases. Run: npx tsx scripts/build-retrieval-gold.ts");
    process.exit(1);
  }

  let r5 = 0;
  let r10 = 0;
  let mrrSum = 0;
  const failures: { id: string; query: string }[] = [];

  for (const tc of cases) {
    const scope = tc.productLine ? { productLine: tc.productLine } : {};
    const { plan, profile } = await resolveSearchPlanWithProfile(tc.query, scope);
    const hits = await searchKnowledgeHitsByPlan(tc.query, plan, profile);

    const ok5 = recallAtK(hits, tc, 5);
    const ok10 = recallAtK(hits, tc, 10);
    if (ok5) r5 += 1;
    if (ok10) r10 += 1;
    mrrSum += mrr(hits, tc);

    if (!ok5) {
      failures.push({ id: tc.id, query: tc.query });
      console.error("MISS", tc.id, tc.query.slice(0, 48), "top:", hits[0]?.customer_question?.slice(0, 40));
    }
  }

  const n = cases.length;
  const recall5 = r5 / n;
  const recall10 = r10 / n;
  const mrrAvg = mrrSum / n;

  console.log(`\nCases: ${n}`);
  console.log(`recall@5:  ${(recall5 * 100).toFixed(1)}% (${r5}/${n})`);
  console.log(`recall@10: ${(recall10 * 100).toFixed(1)}% (${r10}/${n})`);
  console.log(`MRR:       ${mrrAvg.toFixed(3)}`);
  console.log(`Threshold: recall@5 >= ${(threshold * 100).toFixed(0)}%`);

  if (recall5 < threshold) {
    console.error(`\n${failures.length} failures below recall@5`);
    process.exit(1);
  }

  console.log("\nRetrieval recall gate passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
