/**
 * 行動原型 HTTP 煙霧測試（需 dev server: npm run dev）
 * 執行：node scripts/smoke/portal-smoke.mjs [baseUrl]
 * 環境：SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD（或 ADMIN_PASSWORD）
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

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const adminUsername = process.env.SEED_ADMIN_USERNAME ?? process.env.ADMIN_USERNAME ?? "admin";
const adminPassword =
  process.env.SEED_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ok(msg) {
  console.log("OK:", msg);
}

function extractCookie(res) {
  const list = res.headers.getSetCookie?.() ?? [];
  return list.map((c) => c.split(";")[0]).join("; ");
}

async function fetchStatus(url, opts = {}) {
  return fetch(url, { redirect: "manual", ...opts });
}

/** 公開頁 200，或預期導向統一登入 */
async function expectPageOrLoginRedirect(pathname, label) {
  const res = await fetchStatus(`${base}${pathname}`);
  if (res.status === 200) {
    const html = await res.text();
    if (html.length < 100) fail(`${label} empty body`);
    ok(`${pathname} → 200`);
    return;
  }
  if (res.status === 302 || res.status === 307) {
    const loc = res.headers.get("location") ?? "";
    if (loc.includes("/login")) {
      ok(`${pathname} → ${res.status} redirect /login`);
      return;
    }
    fail(`${pathname} unexpected redirect: ${loc}`);
  }
  fail(`${pathname} expected 200 or redirect, got ${res.status}`);
}

async function main() {
  if (!adminPassword) {
    fail("請設定 SEED_ADMIN_PASSWORD 或 ADMIN_PASSWORD");
  }

  await expectPageOrLoginRedirect("/", "/");
  await expectPageOrLoginRedirect("/login", "/login");
  await expectPageOrLoginRedirect("/roleplay", "/roleplay");
  await expectPageOrLoginRedirect("/sales/login", "/sales/login");
  await expectPageOrLoginRedirect("/sales", "/sales");

  const adminProtected = await fetchStatus(`${base}/admin/home`);
  if (adminProtected.status !== 307 && adminProtected.status !== 302) {
    fail(`/admin/home should redirect when logged out, got ${adminProtected.status}`);
  }
  const loc = adminProtected.headers.get("location") ?? "";
  if (!loc.includes("/login")) fail(`/admin/home redirect location wrong: ${loc}`);
  ok(`/admin/home → redirect to /login`);

  const loginRes = await fetch(`${base}/api/portal/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
  if (!loginRes.ok) {
    const authRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: adminUsername, password: adminPassword }),
    });
    if (!authRes.ok) fail(`admin login ${loginRes.status} / ${authRes.status}`);
    const cookieHeader = extractCookie(authRes);
    if (!cookieHeader.includes("ynm_session")) fail("login missing ynm_session");
    ok(`admin login (${adminUsername}) → session cookie`);
    await runAuthedChecks(cookieHeader);
    return;
  }

  const portalCookie = extractCookie(loginRes);
  const authRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
  const adminCookie = authRes.ok ? extractCookie(authRes) : portalCookie;
  if (!adminCookie.includes("ynm_session")) fail("login missing ynm_session");
  ok(`admin login (${adminUsername}) → session cookie`);
  await runAuthedChecks(adminCookie);
}

async function runAuthedChecks(cookieHeader) {
  const chatRes = await fetch(`${base}/api/sales/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ message: "KICKS 跟 HR-V 油耗怎麼比？" }),
  });
  if (!chatRes.ok) fail(`/api/sales/chat status ${chatRes.status}`);
  const chat = await chatRes.json();
  if (!chat.reply || typeof chat.reply !== "string") fail("chat missing reply");
  if (!Array.isArray(chat.citations)) fail("chat missing citations array");
  ok(`/api/sales/chat → reply length=${chat.reply.length}, citations=${chat.citations.length}`);

  const analyticsRes = await fetch(`${base}/api/admin/analytics?section=usage`, {
    headers: { Cookie: cookieHeader },
  });
  if (!analyticsRes.ok) fail(`analytics usage ${analyticsRes.status}`);
  const analytics = await analyticsRes.json();
  if (!Array.isArray(analytics.logs)) fail("analytics logs missing");
  if (!analytics.kpis) fail("analytics kpis missing");
  ok(`analytics usage → ${analytics.logs.length} logs`);

  const lbRes = await fetch(`${base}/api/admin/analytics?section=leaderboard`, {
    headers: { Cookie: cookieHeader },
  });
  if (!lbRes.ok) fail(`analytics leaderboard ${lbRes.status}`);
  const lb = await lbRes.json();
  if (!Array.isArray(lb.branchCards)) fail("leaderboard branchCards missing");
  ok(`analytics leaderboard → ${lb.branchCards.length} branchCards`);

  const topRes = await fetch(`${base}/api/admin/analytics?section=top10`, {
    headers: { Cookie: cookieHeader },
  });
  if (!topRes.ok) fail(`analytics top10 ${topRes.status}`);
  const top = await topRes.json();
  if (!Array.isArray(top.groupedTopics)) fail("top10 groupedTopics missing");
  ok(`analytics top10 → ${top.groupedTopics.length} groupedTopics`);

  const roleplayRes = await fetch(
    `${base}/api/admin/analytics?section=usage&assistantType=roleplay&branch=all&agentUserId=all`,
    { headers: { Cookie: cookieHeader } },
  );
  if (!roleplayRes.ok) fail(`analytics roleplay ${roleplayRes.status}`);
  const rp = await roleplayRes.json();
  if (!Array.isArray(rp.sessions)) fail("roleplay sessions missing");
  const ids = rp.sessions.map((s) => s.sessionId);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) fail(`roleplay sessions duplicate sessionId: ${dup[0]}`);
  ok(`analytics roleplay → ${rp.sessions.length} sessions (unique keys)`);

  const analyticsNoAuth = await fetch(`${base}/api/admin/analytics?section=usage`, {
    redirect: "manual",
    headers: { Cookie: "" },
  });
  if (analyticsNoAuth.status !== 401) {
    fail(`analytics without auth should 401, got ${analyticsNoAuth.status}`);
  }
  ok("analytics without auth → 401");

  console.log("\n全部通過。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
