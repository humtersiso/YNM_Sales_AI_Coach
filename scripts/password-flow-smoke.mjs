/**
 * 一次性密碼流程 smoke test（需先啟動 dev server）
 * 執行：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=Admin1234 npm run smoke:password-flow
 * 或：
 *   node scripts/password-flow-smoke.mjs http://localhost:3000
 */
const base = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_PASSWORD ?? "";

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

async function http(path, options = {}) {
  return fetch(`${base}${path}`, { redirect: "manual", ...options });
}

async function loginAdmin() {
  if (!adminPassword) {
    fail("請設定 ADMIN_PASSWORD 再執行（例如 Admin1234）");
  }
  const res = await http("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
  if (!res.ok) fail(`admin login failed: ${res.status}`);
  const cookie = extractCookie(res);
  if (!cookie.includes("ynm_session")) fail("admin login missing ynm_session");
  ok("admin login success");
  return cookie;
}

async function createAgent(adminCookie) {
  const uniq = Date.now().toString().slice(-8);
  const username = `smoke_user_${uniq}`;
  const initialPassword = "Temp1234";
  const payload = {
    username,
    displayName: `Smoke User ${uniq}`,
    branch: "台北市",
    role: "agent",
    tenureYears: 1,
    password: initialPassword,
  };
  const res = await http("/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookie,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    fail(`create agent failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  if (!data?.user?.username) fail("create agent response missing user");
  ok(`agent created: ${data.user.username}`);
  return {
    username: data.user.username,
    password: data.initialPassword ?? initialPassword,
  };
}

async function loginAgent(username, password) {
  const res = await http("/api/sales/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    fail(`agent login failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  const cookie = extractCookie(res);
  if (!cookie.includes("ynm_sales_session")) fail("agent login missing ynm_sales_session");
  ok("agent login success");
  return { cookie, data };
}

async function assertForcedChange(cookie) {
  const meRes = await http("/api/sales/auth/me", {
    headers: { Cookie: cookie },
  });
  if (!meRes.ok) fail(`/api/sales/auth/me expected 200 got ${meRes.status}`);
  const me = await meRes.json();
  if (!me?.user?.mustChangePassword) fail("expected mustChangePassword=true after initial login");
  ok("mustChangePassword=true after initial login");

  const salesRes = await http("/sales", { headers: { Cookie: cookie } });
  if (![302, 307].includes(salesRes.status)) {
    fail(`/sales should redirect to change-password, got ${salesRes.status}`);
  }
  const loc = salesRes.headers.get("location") ?? "";
  if (!loc.includes("/sales/change-password")) {
    fail(`/sales redirect location invalid: ${loc}`);
  }
  ok("/sales forced redirect to /sales/change-password");
}

async function changePassword(cookie, currentPassword) {
  const newPassword = "Newpass123";
  const res = await http("/api/sales/auth/change-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const text = await res.text();
    fail(`change password failed: ${res.status} ${text}`);
  }
  const nextCookie = extractCookie(res) || cookie;
  ok("password changed");
  return { newPassword, cookie: nextCookie };
}

async function assertUnlocked(cookie) {
  const meRes = await http("/api/sales/auth/me", {
    headers: { Cookie: cookie },
  });
  if (!meRes.ok) fail(`me after change failed: ${meRes.status}`);
  const me = await meRes.json();
  if (me?.user?.mustChangePassword) fail("mustChangePassword should be false after change");
  ok("mustChangePassword=false after password update");

  const salesRes = await http("/sales", { headers: { Cookie: cookie } });
  if (salesRes.status !== 200) {
    fail(`/sales should be accessible after password change, got ${salesRes.status}`);
  }
  ok("/sales accessible after password update");
}

async function main() {
  const adminCookie = await loginAdmin();
  const agent = await createAgent(adminCookie);
  const agentLogin = await loginAgent(agent.username, agent.password);
  await assertForcedChange(agentLogin.cookie);
  const changed = await changePassword(agentLogin.cookie, agent.password);
  await assertUnlocked(changed.cookie);
  console.log("\n全部通過。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
