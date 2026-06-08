/**
 * 對練 RAG 解題驗證（HTTP-only：RAG 在 dev/server 端執行）
 * 依 API 回傳的 coachMaterials 組業代回覆，驗證 factCheck 與客戶口語
 * 用法：tsx scripts/ops/test-roleplay-rag-solve.ts [baseUrl]
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

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
const password = process.env.SEED_ADMIN_PASSWORD ?? "";

const MIN_FACT_CHECK = 14;
const MIN_TOTAL_SCORE = 68;
const ROBOTIC_PAT = /重點\s*\d|佐證\s*\d|表現如何.*重點|fact\s*\d/i;

type Fact = { label: string; value: string };

const SCENARIOS = [
  {
    label: "P-01 vs RAV4",
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
    label: "P-03 vs CR-V",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-03",
      ageRange: "40-50",
      competitor: "Honda CR-V",
      maxTurns: 4,
      difficulty: "advanced",
    },
  },
  {
    label: "P-05 vs Tucson L",
    config: {
      productLine: "xtrail-ice",
      personaId: "P-05",
      ageRange: "30-40",
      competitor: "Hyundai Tucson L",
      maxTurns: 4,
      difficulty: "challenge",
    },
  },
];

const COMPETITORS_FOR_COVERAGE = [
  "Toyota RAV4",
  "Honda CR-V",
  "Hyundai Tucson L",
  "Mitsubishi Outlander",
  "KIA Sportage",
];

function cookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0]).join("; ");
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function login(): Promise<string> {
  if (!password) throw new Error("請在 .env 設定 SEED_ADMIN_PASSWORD");
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`登入失敗 ${res.status}`);
  const cookie = cookieFrom(res);
  if (!cookie) throw new Error("缺少 session cookie");
  return cookie;
}

async function api(cookie: string, method: string, apiPath: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

function buildAgentReplyFromFacts(facts: Fact[], competitor: string, turnIndex: number): string {
  const empathy =
    turnIndex === 0
      ? "我理解您會這樣比，這很正常。"
      : "您提的這點很重要，我依教材資料說明。";
  const fact = facts[turnIndex % facts.length];
  if (!fact) {
    return `${empathy}建議安排試乘比較 ${competitor}，週六上午方便嗎？`;
  }
  const snippet = fact.value.replace(/\s+/g, " ").slice(0, 160);
  const label = fact.label.length <= 28 ? fact.label : "這方面";
  let reply = `${empathy}關於${label}：${snippet}。`;
  if (turnIndex >= 1) {
    reply += " 我可以依年里程現場試算，並安排 30 分鐘試乘。";
  }
  return reply;
}

function themeTokens(text: string): Set<string> {
  const themes = new Set<string>();
  const rules: [RegExp, string][] = [
    [/油耗|km\/L|WLTC|油錢|省油/i, "油耗"],
    [/保養|定保|回廠|保修/i, "保養"],
    [/ProPILOT|輔助|安全|AEB/i, "安全"],
    [/空間|後座|行李/i, "空間"],
    [/價格|優惠|促銷|方案/i, "價格"],
    [/配備|科技|隔音/i, "配備"],
  ];
  for (const [re, tag] of rules) {
    if (re.test(text)) themes.add(tag);
  }
  return themes;
}

function customerThemesMatchRag(customerText: string, facts: Fact[]): boolean {
  const ragThemes = new Set<string>();
  for (const f of facts) {
    for (const t of themeTokens(`${f.label} ${f.value}`)) ragThemes.add(t);
  }
  const custThemes = themeTokens(customerText);
  if (custThemes.size === 0 || ragThemes.size === 0) return true;
  for (const t of custThemes) {
    if (ragThemes.has(t)) return true;
  }
  return false;
}

/** 業代回覆是否引用至少一條 RAG 佐證（標籤或摘要前 20 字） */
function replyCitesRag(agentText: string, facts: Fact[]): boolean {
  for (const f of facts) {
    const chunk = f.value.replace(/\s+/g, "").slice(0, 12);
    if (chunk.length >= 6 && agentText.replace(/\s+/g, "").includes(chunk)) return true;
    const labelBit = f.label.slice(0, 6);
    if (labelBit.length >= 3 && agentText.includes(labelBit)) return true;
  }
  return facts.some((f) => themeTokens(agentText).size > 0 && customerThemesMatchRag(agentText, [f]));
}

type CaseResult = {
  label: string;
  ok: boolean;
  errors: string[];
  score?: number;
  factCheck?: number;
  opening?: string;
  factCount?: number;
  sources?: string[];
};

async function probeCoverage(cookie: string): Promise<void> {
  console.log("【RAG 覆蓋快檢（經 API 開局）】");
  for (const competitor of COMPETITORS_FOR_COVERAGE) {
    const { res, data } = await api(cookie, "POST", "/api/roleplay/sessions", {
      mode: "custom",
      config: {
        productLine: "xtrail-ice",
        personaId: "P-01",
        ageRange: "30-40",
        competitor,
        maxTurns: 3,
        difficulty: "advanced",
      },
    });
    const coach = data.coachMaterials as { facts?: Fact[]; sourceTitles?: string[] } | undefined;
    const n = coach?.facts?.length ?? 0;
    const src = coach?.sourceTitles?.[0]?.slice(0, 36) ?? "—";
    console.log(`  ${competitor}: ${res.ok ? `facts=${n} · ${src}` : `FAIL ${data.error}`}`);
  }
}

async function runCase(cookie: string, scenario: (typeof SCENARIOS)[0]): Promise<CaseResult> {
  const errors: string[] = [];
  const { config } = scenario;

  const { res: startRes, data: start } = await api(cookie, "POST", "/api/roleplay/sessions", {
    mode: "custom",
    config,
  });

  if (!startRes.ok) {
    return {
      label: scenario.label,
      ok: false,
      errors: [`開局失敗 ${startRes.status}: ${start.error ?? JSON.stringify(start)}`],
    };
  }

  const coach = start.coachMaterials as
    | { facts: Fact[]; sourceTitles?: string[] }
    | undefined;
  const facts = coach?.facts ?? [];
  const opening = String(start.customerMessage ?? "");

  if (facts.length < 2) errors.push(`RAG 佐證不足：${facts.length} 條`);
  if (ROBOTIC_PAT.test(opening)) errors.push(`客戶開場太機械：${opening.slice(0, 50)}`);
  if (facts.length >= 2 && !customerThemesMatchRag(opening, facts)) {
    errors.push(`客戶開場與 RAG 主題無交集`);
  }

  const sid = String(start.sessionId);
  const greeting = "您好，在看這台車有什麼問題嗎？我都可以為您說明喔！";

  await api(cookie, "POST", `/api/roleplay/sessions/${encodeURIComponent(sid)}/turn`, {
    message: greeting,
  });

  const agentTurns = Math.min(config.maxTurns - 1, Math.max(facts.length, 2));
  let citedAny = false;

  for (let i = 0; i < agentTurns; i++) {
    const msg = buildAgentReplyFromFacts(facts, config.competitor, i);
    if (replyCitesRag(msg, facts)) citedAny = true;

    const { res: trRes, data: tr } = await api(
      cookie,
      "POST",
      `/api/roleplay/sessions/${encodeURIComponent(sid)}/turn`,
      { message: msg },
    );
    if (!trRes.ok) {
      errors.push(`turn 失敗：${tr.error}`);
      break;
    }
    const cust = String(tr.customerMessage ?? "");
    if (ROBOTIC_PAT.test(cust)) errors.push(`客戶追問太機械：${cust.slice(0, 50)}`);
    if (tr.shouldFinish) break;
  }

  if (facts.length >= 2 && !citedAny) {
    errors.push("業代回覆未引用 RAG 佐證片段（解題腳本異常）");
  }

  const { res: finRes, data: fin } = await api(
    cookie,
    "POST",
    `/api/roleplay/sessions/${encodeURIComponent(sid)}/finish`,
  );
  if (!finRes.ok) {
    errors.push(`評分失敗：${fin.error}`);
    return {
      label: scenario.label,
      ok: false,
      errors,
      opening: opening.slice(0, 80),
      factCount: facts.length,
      sources: coach?.sourceTitles,
    };
  }

  const sr = fin.scoreResult as {
    score?: number;
    dimensions?: { dimensionId: string; score: number }[];
    summary?: string;
  };
  const score = sr?.score ?? 0;
  const factCheck = sr?.dimensions?.find((d) => d.dimensionId === "factCheck")?.score ?? 0;

  if (score < MIN_TOTAL_SCORE) errors.push(`總分 ${score} < ${MIN_TOTAL_SCORE}`);
  if (factCheck < MIN_FACT_CHECK) errors.push(`factCheck ${factCheck} < ${MIN_FACT_CHECK}`);

  return {
    label: scenario.label,
    ok: errors.length === 0,
    errors,
    score,
    factCheck,
    opening: opening.slice(0, 80),
    factCount: facts.length,
    sources: coach?.sourceTitles,
  };
}

async function main() {
  console.log(`\n=== 對練 RAG 解題驗證 @ ${baseUrl} ===\n`);

  const cookie = await login();
  console.log("✓ admin 登入\n");

  await probeCoverage(cookie);
  console.log("");

  const results: CaseResult[] = [];
  for (const sc of SCENARIOS) {
    console.log(`--- ${sc.label} ---`);
    try {
      const r = await runCase(cookie, sc);
      results.push(r);
      console.log(`  RAG 佐證 ${r.factCount ?? 0} 條 · 來源 ${r.sources?.[0]?.slice(0, 40) ?? "—"}`);
      console.log(`  開場：${r.opening ?? "—"}…`);
      console.log(`  評分 ${r.score ?? "?"} · factCheck ${r.factCheck ?? "?"}`);
      if (r.ok) console.log("  ✓ 通過（依 RAG 解題）");
      else console.log(`  ✗ ${r.errors.join("；")}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ label: sc.label, ok: false, errors: [msg] });
      console.log(`  ✗ ${msg}`);
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== 結果 ${passed}/${results.length} 場通過 ===\n`);
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
