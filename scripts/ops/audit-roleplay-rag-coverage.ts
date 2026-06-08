/**
 * 對練 RAG 覆蓋率稽核：競品 × 人設 × 難度
 * 用法：tsx scripts/ops/audit-roleplay-rag-coverage.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROLEPLAY_AGE_RANGES,
  ROLEPLAY_COMPETITORS_XTRAIL,
  ROLEPLAY_DIFFICULTIES,
} from "../../src/lib/roleplay/catalog";
import { ROLEPLAY_PERSONA_IDS } from "../../src/lib/roleplay/seed/global-config";
import {
  buildRagCoverageSummary,
  fetchRoleplayRagContext,
} from "../../src/lib/roleplay/rag-context";
import type { RoleplaySessionConfig } from "../../src/lib/roleplay/scenario-contract";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outJson = path.join(webRoot, "data/roleplay-rag-coverage-audit.json");
const outHtml = path.join(webRoot, "docs/ROLEPLAY_RAG_COVERAGE_AUDIT.html");

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

type AuditRow = {
  competitor: string;
  personaId: string;
  difficulty: string;
  ageRange: string;
  coverageOk: boolean;
  factCount: number;
  hitCount: number;
  factLabels: string[];
  sourceTitles: string[];
  strategyIds: string[];
};

async function main() {
  const rows: AuditRow[] = [];
  const inventoryPath = path.join(webRoot, "data/training-materials-inventory.json");
  const inventory = fs.existsSync(inventoryPath)
    ? (JSON.parse(fs.readFileSync(inventoryPath, "utf8")) as {
        productLines?: { samplePaths?: string[] }[];
      })
    : null;
  const corpusFiles =
    inventory?.productLines?.flatMap((p) => p.samplePaths ?? []) ?? [];

  for (const competitor of ROLEPLAY_COMPETITORS_XTRAIL) {
    for (const personaId of ROLEPLAY_PERSONA_IDS) {
      for (const difficulty of ROLEPLAY_DIFFICULTIES) {
        const config: RoleplaySessionConfig = {
          productLine: "xtrail-ice",
          personaId,
          ageRange: ROLEPLAY_AGE_RANGES[1]!.id,
          competitor,
          maxTurns: 5,
          difficulty: difficulty.id,
        };
        const rag = await fetchRoleplayRagContext(config);
        const summary = buildRagCoverageSummary(rag);
        rows.push({
          competitor,
          personaId,
          difficulty: difficulty.id,
          ageRange: config.ageRange,
          coverageOk: summary.coverageOk,
          factCount: summary.factCount,
          hitCount: summary.hitCount,
          factLabels: rag.facts.map((f) => f.label),
          sourceTitles: summary.sourceTitles,
          strategyIds: summary.strategyIds,
        });
      }
    }
  }

  const okCount = rows.filter((r) => r.coverageOk).length;
  const report = {
    scannedAt: new Date().toISOString(),
    totalCombinations: rows.length,
    coverageOkCount: okCount,
    coverageFailCount: rows.length - okCount,
    corpusFileSamples: corpusFiles,
    rows,
  };

  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  const failRows = rows.filter((r) => !r.coverageOk);
  const html = `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="UTF-8"/><title>對練 RAG 覆蓋率稽核</title>
<style>body{font-family:"Microsoft JhengHei",sans-serif;margin:1.5rem;max-width:960px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #ccc;padding:.4rem .5rem}
.ok{background:#ecfdf5}.fail{background:#fef2f2}h1{font-size:1.3rem}</style></head><body>
<h1>對練 RAG 覆蓋率稽核</h1>
<p>掃描時間：${report.scannedAt}<br/>
組合數 ${report.totalCombinations} · 通過 ${okCount} · 不足 ${failRows.length}</p>
<table><thead><tr><th>競品</th><th>人設</th><th>難度</th><th>facts</th><th>hits</th><th>來源</th><th>狀態</th></tr></thead>
<tbody>${rows
  .map(
    (r) =>
      `<tr class="${r.coverageOk ? "ok" : "fail"}"><td>${r.competitor}</td><td>${r.personaId}</td><td>${r.difficulty}</td><td>${r.factCount}</td><td>${r.hitCount}</td><td>${r.sourceTitles.slice(0, 2).join("<br/>") || "—"}</td><td>${r.coverageOk ? "OK" : "不足"}</td></tr>`,
  )
  .join("")}</tbody></table>
<p>JSON：<code>data/roleplay-rag-coverage-audit.json</code></p>
</body></html>`;
  fs.writeFileSync(outHtml, html, "utf8");

  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outHtml}`);
  console.log(`Coverage OK: ${okCount}/${rows.length}`);
  if (failRows.length) {
    console.log("Failed combinations:");
    for (const r of failRows.slice(0, 10)) {
      console.log(`  - ${r.competitor} / ${r.personaId} / ${r.difficulty}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
