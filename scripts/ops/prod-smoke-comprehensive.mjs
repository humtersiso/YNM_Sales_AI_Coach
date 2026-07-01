/**
 * 正式環境廣域煙測（銷售 + 對練 + 後台 API）
 * 用法：node scripts/ops/prod-smoke-comprehensive.mjs [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SALES_CHAT_TEST_CASES } from "./sales-chat-test-cases.mjs";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const baseUrl = (process.argv[2] ?? "https://ynm-web-prod-653828324568.asia-east1.run.app").replace(/\/$/, "");

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
  const prodYaml = path.join(webRoot, "deploy/cloudrun-prod.env.yaml");
  if (fs.existsSync(prodYaml) && !process.env.SEED_ADMIN_PASSWORD) {
    const m = fs.readFileSync(prodYaml, "utf8").match(/SEED_ADMIN_PASSWORD:\s*"?([^"\n]+)"?/);
    if (m?.[1]) process.env.SEED_ADMIN_PASSWORD = m[1].trim();
  }
}

loadEnv();

const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
const password = process.env.SEED_ADMIN_PASSWORD ?? process.env.TEST_SALES_PASSWORD ?? "";

const results = [];
const sessionIds = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark} | ${name}${detail ? ` | ${detail}` : ""}`);
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0]).join("; ");
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function api(cookie, method, p, body) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function login() {
  for (const ep of ["/api/auth/login", "/api/portal/auth/login"]) {
    const res = await fetch(`${baseUrl}${ep}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const cookie = cookieFrom(res);
    if (res.ok && cookie) return { cookie, via: ep };
  }
  throw new Error("登入失敗");
}

async function testPages() {
  for (const p of ["/", "/login", "/roleplay", "/sales"]) {
    const res = await fetch(`${baseUrl}${p}`, { redirect: "manual" });
    const ok = res.status === 200 || res.status === 307 || res.status === 302;
    record(`page ${p}`, ok, `status=${res.status}`);
  }
}

async function testSalesChat(cookie) {
  const cases = SALES_CHAT_TEST_CASES;
  let passed = 0;
  for (const tc of cases) {
    const t0 = Date.now();
    const { res, data } = await api(cookie, "POST", "/api/sales/chat", {
      message: tc.question,
      productLine: "xtrail-ice",
    });
    const ms = Date.now() - t0;
    const reply = String(data.reply ?? "").trim();
    const truncated =
      reply.length > 20 &&
      !/[。！？.!?]$/.test(reply) &&
      (data.bullets ?? []).some((b) => b.length > 30 && !/[。！？.!?]$/.test(b.trim()));
    const ok =
      res.status === 200 &&
      reply.length > 15 &&
      Boolean(data.inQuestionBank) === tc.expectBank &&
      !/\[\d+\]/.test(reply) &&
      !truncated;
    if (ok) passed += 1;
    record(`sales ${tc.id}`, ok, `${ms}ms bank=${data.inQuestionBank} bullets=${(data.bullets ?? []).length} len=${reply.length}`);
  }
  record("sales suite", passed === cases.length, `${passed}/${cases.length}`);
}

async function runRoleplaySession(cookie, opt, { maxTurns, label, opening, dialogueLines, closing }) {
  const competitor = opt.competitors?.find((c) => /RAV4/i.test(c)) ?? opt.competitors?.[0];
  const { res: startRes, data: start } = await api(cookie, "POST", "/api/roleplay/sessions", {
    mode: "custom",
    config: {
      productLine: opt.products[0].id,
      personaId: "P-01",
      ageRange: "30-40",
      competitor,
      maxTurns,
      difficulty: "advanced",
    },
  });
  if (!startRes.ok) throw new Error(`開局失敗: ${start.error ?? startRes.status}`);
  const sid = start.sessionId;
  sessionIds.push(sid);

  if (!start.coachMaterials?.facts?.length || start.coachMaterials.facts.length < 2) {
    throw new Error(`RAG 佐證不足: ${start.coachMaterials?.facts?.length ?? 0}`);
  }
  record(`${label} 開局`, true, `sid=${sid.slice(0, 8)}… facts=${start.coachMaterials.facts.length}`);

  const allLines = [opening, ...dialogueLines];
  if (dialogueLines.length !== maxTurns) {
    throw new Error(`${label} 需 ${maxTurns} 輪對話（不含開場招呼），實際 ${dialogueLines.length}`);
  }

  let turn = 0;
  for (const msg of allLines) {
    const { res: tr, data: td } = await api(
      cookie,
      "POST",
      `/api/roleplay/sessions/${encodeURIComponent(sid)}/turn`,
      { message: msg },
    );
    if (!tr.ok) throw new Error(`turn 失敗: ${td.error ?? tr.status}`);
    turn = td.turn ?? turn + 1;
    if (td.awaitingAgentClosing) {
      record(`${label} 達輪次上限`, true, `turn=${turn} 待收尾`);
      break;
    }
    const cust = String(td.customerMessage ?? "");
    const custTrunc = cust.length > 15 && !/[。！？.!?？]$/.test(cust.trim());
    record(`${label} 輪次${turn}`, !custTrunc, cust.slice(0, 48));
  }

  const { res: closeRes, data: closeData } = await api(
    cookie,
    "POST",
    `/api/roleplay/sessions/${encodeURIComponent(sid)}/turn`,
    { message: closing },
  );
  if (!closeRes.ok) throw new Error(`收尾失敗: ${closeData.error ?? closeRes.status}`);
  if (!closeData.readyToScore) throw new Error(`${label} 收尾後 readyToScore 應為 true`);

  const { res: finRes, data: fin } = await api(
    cookie,
    "POST",
    `/api/roleplay/sessions/${encodeURIComponent(sid)}/finish`,
  );
  if (!finRes.ok) throw new Error(`評分失敗: ${fin.error ?? finRes.status}`);
  const score = fin.scoreResult?.score;
  const dims = fin.scoreResult?.dimensions ?? [];
  const dimSum = dims.reduce((s, d) => s + (d.score ?? 0), 0);
  const consistent = score != null && Math.abs(score - dimSum) < 0.5;
  const hasSectionD = JSON.stringify(fin.scoreResult ?? {}).includes("Section D");
  record(`${label} 評分`, Boolean(score) && consistent && !hasSectionD, `score=${score} dimSum=${dimSum}`);
  return { sid, score, dimSum };
}

async function testRoleplay(cookie, opt) {
  await runRoleplaySession(cookie, opt, {
    label: "roleplay-5輪",
    maxTurns: 5,
    opening: "您好，歡迎來看 X-TRAIL ICE，今天想了解空間還是油耗呢？",
    dialogueLines: [
      "X-TRAIL ICE 後座膝部空間約 690mm，WLTC 綜合油耗約 16.1km/L，可現場試算十年持有成本。",
      "競品 RAV4 雖主打油耗，但我們 VC-TURBO 在中高速再加速更充沛，且全車 7 片鋁合金板件靜謐性更好。",
      "若您在意後座，我們後座可滑移 14 公分並調整傾角，家人長途乘坐更舒適。",
      "建議您這週六下午試乘，我可以準備同路段油耗試算表給您帶回討論。",
      "若您還有預算或保養週期的疑慮，我們也可以一併試算，讓您帶回跟家人討論。",
    ],
    closing: "今天感謝您抽空來店，有任何問題歡迎隨時聯絡，期待您試乘體驗。",
  });

  await runRoleplaySession(cookie, opt, {
    label: "roleplay-7輪",
    maxTurns: 7,
    opening: "您好，在看 X-TRAIL ICE 嗎？想先了解動力還是安全配備？",
    dialogueLines: [
      "我們搭載 ProPILOT 全速域 Level 2，並有 10 年電池保固，日常通勤很安心。",
      "跟 RAV4 比，X-TRAIL 後座膝部空間多約 4 公分，車室寬度也較寬。",
      "馬力 204ps、扭力 30.6kgm，市區起步輕快，高速再加速也夠用。",
      "若您在意異音，我們車室有雙層隔音玻璃，實際試乘最能感受差異。",
      "回廠定保一次約 2～5 千元，十年油資加總我們可以試算給您參考。",
      "這週末可以安排 30 分鐘試乘，順便帶家人體驗後座空間。",
      "若您需要，我也可以準備同級車比較表，方便您回家跟家人討論。",
    ],
    closing: "謝謝您今天的時間，我會把試算表傳給您，歡迎預約試乘。",
  });
}

async function testAdmin(cookie) {
  for (const section of ["usage", "leaderboard", "top10"]) {
    const res = await fetch(`${baseUrl}/api/admin/analytics?section=${section}`, {
      headers: { Cookie: cookie },
    });
    record(`admin analytics ${section}`, res.ok, `status=${res.status}`);
  }
  const rp = await fetch(
    `${baseUrl}/api/admin/analytics?section=usage&assistantType=roleplay&branch=all&agentUserId=all`,
    { headers: { Cookie: cookie } },
  );
  record("admin roleplay sessions", rp.ok);
  const { res: statsRes, data: stats } = await api(cookie, "GET", "/api/roleplay/me/stats");
  record("roleplay me/stats", statsRes.ok, `completed=${stats.completedSessions ?? 0}`);
  const { res: histRes, data: hist } = await api(cookie, "GET", "/api/roleplay/me/history");
  record("roleplay me/history", histRes.ok, `items=${Array.isArray(hist) ? hist.length : "?"}`);
}

async function main() {
  if (!password) throw new Error("缺少 SEED_ADMIN_PASSWORD");
  console.log(`\n=== 正式環境廣域煙測 ===\nURL: ${baseUrl}\n`);

  await testPages();

  const { cookie, via } = await login();
  record("admin 登入", true, via);

  const { res: optRes, data: opt } = await api(cookie, "GET", "/api/roleplay/config-options");
  record("roleplay config-options", optRes.ok && opt.products?.length > 0);

  await testSalesChat(cookie);
  await testRoleplay(cookie, opt);
  await testAdmin(cookie);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== 摘要 ${passed}/${results.length} 通過 ===`);
  if (failed.length) {
    console.log("失敗項目:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }

  const logDir = path.join(webRoot, "data", "test-logs");
  fs.mkdirSync(logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logPath = path.join(logDir, `prod-smoke-${stamp}.json`);
  fs.writeFileSync(
    logPath,
    JSON.stringify({ baseUrl, passed, total: results.length, results, sessionIds }, null, 2),
    "utf8",
  );
  console.log(`\nLOG: ${logPath}`);
  console.log(`SESSION_IDS: ${sessionIds.join(", ")}`);

  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});
