/**
 * 煙測：登入 → config-options → 開局 → GET bootstrap → 一輪對話 → 評分
 * 用法：node scripts/ops/test-roleplay-setup-flow.mjs [baseUrl]
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

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0]).join("; ");
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function main() {
  console.log(`對練 setup→practice 流程煙測 @ ${baseUrl}\n`);

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!loginRes.ok) throw new Error(`登入失敗 ${loginRes.status}`);
  const cookie = cookieFrom(loginRes);
  console.log("✓ admin 登入");

  const { res: optRes, data: opt } = await api(cookie, "GET", "/api/roleplay/config-options");
  if (!optRes.ok) throw new Error(`config-options ${optRes.status}`);
  if (!opt.products?.length) throw new Error("無可用車型");
  const competitor = opt.competitors?.[0];
  if (!competitor) throw new Error("無競品選項");
  console.log(`✓ config-options 車型=${opt.products[0].id} 競品=${competitor}`);

  const { res: startRes, data: start } = await api(cookie, "POST", "/api/roleplay/sessions", {
    mode: "custom",
    config: {
      productLine: opt.products[0].id,
      personaId: opt.personas?.[0]?.id ?? "P-01",
      ageRange: "30-40",
      competitor,
      maxTurns: 3,
      difficulty: "beginner",
    },
  });
  if (!startRes.ok) throw new Error(`開局失敗 ${startRes.status}: ${start.error ?? JSON.stringify(start)}`);
  if (!start.sessionId || !start.customerMessage?.trim()) {
    throw new Error("開局回應缺少 sessionId 或 customerMessage");
  }
  console.log(`✓ 開局 session=${start.sessionId}`);
  if (!start.coachMaterials?.facts || start.coachMaterials.facts.length < 2) {
    throw new Error(`RAG gate：需至少 2 條佐證，實際 ${start.coachMaterials?.facts?.length ?? 0}`);
  }
  console.log(`✓ RAG 佐證 ${start.coachMaterials.facts.length} 條`);

  const { res: getRes, data: boot } = await api(
    cookie,
    "GET",
    `/api/roleplay/sessions/${encodeURIComponent(start.sessionId)}`,
  );
  if (!getRes.ok) throw new Error(`GET bootstrap ${getRes.status}: ${boot.error}`);
  if (boot.status !== "active" || !boot.messages?.length) {
    throw new Error(`bootstrap 無效: ${JSON.stringify(boot)}`);
  }
  console.log(`✓ GET bootstrap ${boot.messages.length} 則訊息`);

  const { res: turnRes, data: turn } = await api(
    cookie,
    "POST",
    `/api/roleplay/sessions/${encodeURIComponent(start.sessionId)}/turn`,
    { message: "我理解您在意油耗，我們可以用試算表具體比較。" },
  );
  if (!turnRes.ok) throw new Error(`turn 失敗 ${turnRes.status}: ${turn.error}`);
  console.log(`✓ 第 ${turn.turn} 輪客戶回覆`);

  const { res: finRes, data: fin } = await api(
    cookie,
    "POST",
    `/api/roleplay/sessions/${encodeURIComponent(start.sessionId)}/finish`,
  );
  if (!finRes.ok) throw new Error(`finish 失敗 ${finRes.status}: ${fin.error}`);
  if (!fin.scoreResult?.score) throw new Error("無評分");
  console.log(`✓ 評分 ${fin.scoreResult.score} 分`);

  const { res: statsRes, data: stats } = await api(cookie, "GET", "/api/roleplay/me/stats");
  if (!statsRes.ok) throw new Error(`stats 失敗 ${statsRes.status}`);
  if (!stats.briefing?.strengthLine) {
    throw new Error("完賽後首頁小結應已寫入 BQ（briefing 為空）");
  }
  console.log(`✓ 首頁小結：${stats.briefing.strengthLine.slice(0, 24)}…`);
  console.log("\n--- 全流程 OK ---");
}

main().catch((e) => {
  console.error("✗", e.message || e);
  process.exit(1);
});
