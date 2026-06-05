/**
 * 以 admin 登入本地 dev，完成 5 場不同情境對練（HTTP API）
 * 用法：node scripts/ops/test-roleplay-admin-five.mjs [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const baseUrl = (process.argv[2] ?? process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
const password = process.env.SEED_ADMIN_PASSWORD ?? "";

const SCENARIOS = [
  {
    label: "P-01 新手 vs RAV4",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-01",
      ageRange: "30-40",
      competitor: "Toyota RAV4",
      maxTurns: 3,
      difficulty: "beginner",
    },
  },
  {
    label: "P-02 進階 vs CR-V",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-02",
      ageRange: "20-30",
      competitor: "Honda CR-V",
      maxTurns: 4,
      difficulty: "advanced",
    },
  },
  {
    label: "P-03 挑戰 vs Tucson",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-03",
      ageRange: "40-50",
      competitor: "Hyundai Tucson L",
      maxTurns: 4,
      difficulty: "challenge",
    },
  },
  {
    label: "P-04 進階 vs Outlander",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-04",
      ageRange: "50+",
      competitor: "Mitsubishi Outlander",
      maxTurns: 3,
      difficulty: "advanced",
    },
  },
  {
    label: "P-05 挑戰 vs RAV4",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-05",
      ageRange: "30-40",
      competitor: "Toyota RAV4",
      maxTurns: 5,
      difficulty: "challenge",
    },
  },
];

const REPLIES = [
  "我理解您在意油耗，X-TRAIL ICE 在 WLTC 約 14km/L，可依年里程試算。",
  "同級還有 ProPILOT 與空間優勢，建議安排試乘比較體感。",
  "若預算允許，可搭配保固與分期方案，讓月付更清楚。",
];

function cookieFromResponse(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0]).join("; ");
  const single = res.headers.get("set-cookie");
  return single ? single.split(";")[0] : "";
}

async function loginAdmin() {
  if (!password) throw new Error("請在 .env 設定 SEED_ADMIN_PASSWORD");
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`admin 登入失敗 ${res.status}: ${text}`);
  const cookie = cookieFromResponse(res);
  if (!cookie.includes("ynm_session")) throw new Error("登入回應缺少 ynm_session");
  return cookie;
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${data.error ?? JSON.stringify(data)}`);
  return data;
}

async function runScenario(cookie, scenario, index) {
  console.log(`\n[${index + 1}/5] ${scenario.label}`);
  const start = await api(cookie, "POST", "/api/roleplay/sessions", {
    mode: "custom",
    config: scenario.config,
  });
  const sid = start.sessionId;
  console.log(`  開局 session=${sid}`);
  console.log(`  客戶：${(start.customerMessage ?? "").slice(0, 70)}…`);

  const turns = Math.min(2, scenario.config.maxTurns);
  for (let i = 0; i < turns; i++) {
    const tr = await api(cookie, "POST", `/api/roleplay/sessions/${encodeURIComponent(sid)}/turn`, {
      message: REPLIES[i % REPLIES.length],
    });
    console.log(`  輪 ${tr.turn} 客戶：${(tr.customerMessage ?? "").slice(0, 50)}…`);
    if (tr.shouldFinish) break;
  }

  const fin = await api(cookie, "POST", `/api/roleplay/sessions/${encodeURIComponent(sid)}/finish`);
  const sr = fin.scoreResult;
  if (!sr) throw new Error("無評分結果");
  console.log(`  完賽 ${sr.score}/100 · ${sr.grade}`);
  console.log(
    `  五維：${sr.dimensions.map((d) => `${d.label}${d.score}`).join(" · ")}`,
  );
  if (sr.improvementTips?.length) {
    console.log(`  建議：${sr.improvementTips[0]?.slice(0, 60)}…`);
  }
  return { sessionId: sid, score: sr.score };
}

async function main() {
  console.log(`對練 admin 五情境煙測 @ ${baseUrl}\n`);
  const cookie = await loginAdmin();
  console.log(`admin (${username}) 登入成功`);

  const me = await fetch(`${baseUrl}/api/portal/auth/me`, {
    headers: { Cookie: cookie },
  });
  const meData = await me.json().catch(() => ({}));
  console.log(`身分：${meData.user?.role ?? "?"} · ${meData.user?.displayName ?? username}`);

  const results = [];
  for (let i = 0; i < SCENARIOS.length; i++) {
    try {
      results.push(await runScenario(cookie, SCENARIOS[i], i));
    } catch (e) {
      console.error(`  失敗：${e.message}`);
      results.push(null);
    }
  }

  const ok = results.filter(Boolean).length;
  console.log(`\n--- 完成 ${ok}/5 場 ---`);

  await new Promise((r) => setTimeout(r, 2500));
  const stats = await api(cookie, "GET", "/api/roleplay/me/stats");
  console.log(`戰績 API：總場次=${stats.totalSessions} 均分=${stats.overallAvg} 最近=${stats.lastScore}`);

  const hist = await api(cookie, "GET", "/api/roleplay/me/history?limit=5");
  console.log(`歷史 API：${hist.items?.length ?? 0} 筆`);

  process.exitCode = ok === 5 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
