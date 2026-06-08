/**
 * 匯出各競品 RAG 佐證（供高分文件撰寫）
 * node scripts/ops/dump-roleplay-rag-facts.mjs [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const user = process.env.SEED_ADMIN_USERNAME ?? "admin";
const pass = process.env.SEED_ADMIN_PASSWORD ?? "";
const comps = [
  "Toyota RAV4",
  "Honda CR-V",
  "Hyundai Tucson L",
  "Mitsubishi Outlander",
  "KIA Sportage",
];

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: user, password: pass }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
const out = [];

for (const competitor of comps) {
  const r = await fetch(`${base}/api/roleplay/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      mode: "custom",
      config: {
        productLine: "xtrail-ice",
        personaId: "P-01",
        ageRange: "30-40",
        competitor,
        maxTurns: 5,
        difficulty: "advanced",
      },
    }),
  });
  const d = await r.json();
  out.push({
    competitor,
    ok: r.ok,
    opening: d.customerMessage ?? "",
    facts: (d.coachMaterials?.facts ?? []).slice(0, 8),
    sources: d.coachMaterials?.sourceTitles ?? [],
  });
}

const outPath = path.join(webRoot, "data/roleplay-rag-playbook-snapshot.json");
fs.writeFileSync(outPath, JSON.stringify({ exportedAt: new Date().toISOString(), items: out }, null, 2));
console.log(`Wrote ${outPath}`);
for (const item of out) {
  console.log(`\n## ${item.competitor} (${item.facts.length} facts)`);
  console.log(`開場：${item.opening.slice(0, 100)}…`);
  for (const f of item.facts.slice(0, 3)) {
    console.log(`- ${f.label}: ${f.value.slice(0, 80)}…`);
  }
}
