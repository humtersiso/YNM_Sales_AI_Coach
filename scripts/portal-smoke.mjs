/**
 * 行動原型 HTTP 煙霧測試（需 dev server: npm run dev）
 * 執行：node scripts/portal-smoke.mjs [baseUrl]
 */
const base = process.argv[2] ?? "http://localhost:3000";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ok(msg) {
  console.log("OK:", msg);
}

async function fetchStatus(url, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts });
  return res;
}

async function main() {
  const pages = ["/", "/sales/login", "/roleplay", "/sales", "/admin/login"];
  for (const p of pages) {
    const res = await fetchStatus(`${base}${p}`);
    if (res.status !== 200) fail(`${p} expected 200, got ${res.status}`);
    const html = await res.text();
    if (html.length < 100) fail(`${p} empty body`);
    ok(`${p} → ${res.status}`);
  }

  const adminProtected = await fetchStatus(`${base}/admin/home`);
  if (adminProtected.status !== 307 && adminProtected.status !== 302) {
    fail(`/admin/home should redirect when logged out, got ${adminProtected.status}`);
  }
  const loc = adminProtected.headers.get("location") ?? "";
  if (!loc.includes("/admin/login")) fail(`/admin/home redirect location wrong: ${loc}`);
  ok(`/admin/home → redirect to login`);

  const chatRes = await fetch(`${base}/api/sales/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "KICKS 跟 HR-V 油耗怎麼比？" }),
  });
  if (!chatRes.ok) fail(`/api/sales/chat status ${chatRes.status}`);
  const chat = await chatRes.json();
  if (!chat.reply || typeof chat.reply !== "string") fail("chat missing reply");
  if (!Array.isArray(chat.citations)) fail("chat missing citations array");
  ok(`/api/sales/chat → reply length=${chat.reply.length}, citations=${chat.citations.length}`);

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "YLG_001", password: "1111" }),
  });
  if (!loginRes.ok) fail(`admin login ${loginRes.status}`);
  const setCookie = loginRes.headers.getSetCookie?.() ?? [];
  const cookieHeader = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!cookieHeader.includes("ynm_session")) fail("login missing session cookie");
  ok("admin login → session cookie");

  const analyticsRes = await fetch(`${base}/api/admin/analytics?section=usage`, {
    headers: { Cookie: cookieHeader },
  });
  if (!analyticsRes.ok) fail(`analytics ${analyticsRes.status}`);
  const analytics = await analyticsRes.json();
  if (!Array.isArray(analytics.logs) || analytics.logs.length < 1) fail("analytics logs empty");
  if (!analytics.kpis) fail("analytics kpis missing");
  ok(`analytics usage → ${analytics.logs.length} logs`);

  const lbRes = await fetch(`${base}/api/admin/analytics?section=leaderboard`, {
    headers: { Cookie: cookieHeader },
  });
  const lb = await lbRes.json();
  if (!lb.rows?.length) fail("leaderboard empty");
  ok(`analytics leaderboard → ${lb.rows.length} rows`);

  const topRes = await fetch(`${base}/api/admin/analytics?section=top10`, {
    headers: { Cookie: cookieHeader },
  });
  const top = await topRes.json();
  if (!top.items?.length) fail("top10 empty");
  ok(`analytics top10 → ${top.items.length} items`);

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
