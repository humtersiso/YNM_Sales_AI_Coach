/**
 * 部署後驗證：登入 Cloud Run → 逐題呼叫 /api/sales/chat
 * 用法：node scripts/ops/test-cloudrun-sales-chat.mjs [BASE_URL]
 *       node scripts/ops/test-cloudrun-sales-chat.mjs --sample   # 5 題快測
 *       CLOUDRUN_URL=https://... TEST_SALES_PASSWORD=... node ...
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SALES_CHAT_TEST_CASES } from "./sales-chat-test-cases.mjs";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const projectId = process.env.DEPLOY_PROJECT_ID || "gen-lang-client-0927009312";
const region = process.env.DEPLOY_REGION || "asia-east1";
const service = process.env.DEPLOY_SERVICE || "ynm-web-test";

const SAMPLE_IDS = new Set(["reg-01", "spec-01", "spec-02", "qa-02", "guard-01"]);

function parseArgs() {
  const argv = process.argv.slice(2);
  const sample = argv.includes("--sample");
  const urlArg = argv.find((a) => a.startsWith("http"));
  return { sample, urlArg };
}

function resolveCases(sample) {
  if (!sample) return SALES_CHAT_TEST_CASES;
  return SALES_CHAT_TEST_CASES.filter((c) => SAMPLE_IDS.has(c.id));
}

function gcloudServiceUrl() {
  const r = spawnSync(
    "gcloud",
    [
      "run",
      "services",
      "describe",
      service,
      "--region",
      region,
      "--project",
      projectId,
      "--format=value(status.url)",
    ],
    { encoding: "utf8", shell: true },
  );
  if (r.status !== 0) return null;
  return (r.stdout || "").trim() || null;
}

function loadSeedCreds() {
  const user = process.env.TEST_SALES_USER || "admin";
  const pass = process.env.TEST_SALES_PASSWORD || "";
  const envPath = path.join(webRoot, "deploy/cloudrun-test.env.yaml");
  let username = user;
  let password = pass;
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    const u = text.match(/SEED_ADMIN_USERNAME:\s*"?([^"\n]+)"?/);
    const p = text.match(/SEED_ADMIN_PASSWORD:\s*"?([^"\n]+)"?/);
    if (!process.env.TEST_SALES_USER && u?.[1]) username = u[1].trim();
    if (!password && p?.[1]) password = p[1].trim();
  }
  return { username, password };
}

function parseSetCookie(header) {
  if (!header) return "";
  const parts = Array.isArray(header) ? header : [header];
  return parts.map((c) => c.split(";")[0]).join("; ");
}

async function login(baseUrl, creds) {
  /** 銷售登入需 role=agent；管理員請走 portal，chat API 亦接受 ynm_session */
  const endpoints = ["/api/sales/auth/login", "/api/auth/login"];
  let lastErr = "";
  for (const ep of endpoints) {
    const res = await fetch(`${baseUrl}${ep}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: creds.username, password: creds.password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      lastErr = `${ep} ${res.status}: ${JSON.stringify(data)}`;
      continue;
    }
    const cookie = parseSetCookie(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
    if (!cookie) {
      lastErr = `${ep} 無 session cookie`;
      continue;
    }
    return { cookie, via: ep };
  }
  throw new Error(
    `登入失敗：${lastErr}。請設定 TEST_SALES_PASSWORD，或 npm run admin:reset-password（管理員走 /api/auth/login）`,
  );
}

async function askChat(baseUrl, cookie, question) {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/api/sales/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ message: question, productLine: "xtrail-ice" }),
  });
  const ms = Date.now() - t0;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ms, data };
}

function validateCase(tc, { status, data }) {
  const bank = Boolean(data.inQuestionBank);
  const cites = Array.isArray(data.citations) ? data.citations.length : 0;
  const reply = String(data.reply ?? "").trim();
  const bullets = Array.isArray(data.bullets) ? data.bullets.length : 0;
  const hasReply = reply.length > 20;
  const phantomMarkers = (reply.match(/\[\d+\]/g) ?? []).length;
  const docTitleOnly = /^《[^》]+》$/.test(reply);
  const ok =
    status === 200 &&
    hasReply &&
    bank === tc.expectBank &&
    (tc.expectBank ? cites >= 1 : true) &&
    phantomMarkers === 0 &&
    !docTitleOnly;

  return { bank, cites, bullets, reply, hasReply, phantomMarkers, docTitleOnly, ok };
}

async function main() {
  const { sample, urlArg } = parseArgs();
  const CASES = resolveCases(sample);
  const defaultCloudUrl = "https://ynm-web-test-653828324568.asia-east1.run.app";
  const baseUrl = (urlArg || process.env.CLOUDRUN_URL || gcloudServiceUrl() || defaultCloudUrl).replace(
    /\/$/,
    "",
  );
  if (!baseUrl) {
    console.error("請提供 BASE_URL 或設定 CLOUDRUN_URL");
    process.exit(1);
  }

  const creds = loadSeedCreds();
  if (!creds.password) {
    console.error("請設定 TEST_SALES_PASSWORD 或 deploy/cloudrun-test.env.yaml 中的 SEED_ADMIN_PASSWORD");
    process.exit(1);
  }

  console.log("Cloud Run 銷售助手驗證");
  console.log("URL:", baseUrl);
  console.log("案例數:", CASES.length, sample ? "(快測 --sample)" : "(完整 20 題)");
  console.log("");

  let cookie;
  let via;
  try {
    ({ cookie, via } = await login(baseUrl, creds));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const refused = /fetch failed|ECONNREFUSED/i.test(msg) || (e instanceof Error && e.cause);
    if (refused && /localhost|127\.0\.0\.1/.test(baseUrl)) {
      console.error("\n無法連線", baseUrl);
      console.error("本機 8080 沒有服務在跑。請先擇一啟動：");
      console.error("  npm run run:prod-local          （無 Docker，推薦 Windows）");
      console.error("  npm run docker:run:local -- --build  （需 Docker Desktop）");
      console.error("  npm run dev                     （port 3000，測試時改 URL）");
      console.error("\n或直接測 Cloud Run：");
      console.error(`  npm run test:cloudrun:chat:sample ${defaultCloudUrl}`);
    } else {
      console.error(msg);
    }
    process.exit(1);
  }
  console.log(`登入 OK（${via}）\n`);

  let passed = 0;
  const rows = [];

  for (const tc of CASES) {
    const { status, ms, data } = await askChat(baseUrl, cookie, tc.question);
    const v = validateCase(tc, { status, data });
    if (v.ok) passed += 1;
    rows.push({
      id: tc.id,
      category: tc.category,
      ok: v.ok,
      status,
      ms,
      bank: v.bank,
      expectBank: tc.expectBank,
      cites: v.cites,
      bullets: v.bullets,
      phantomMarkers: v.phantomMarkers,
      preview: v.reply.slice(0, 72),
      error: data.error,
    });
    console.log(
      `${v.ok ? "OK" : "FAIL"} [${tc.id}] ${ms}ms bank=${v.bank} cites=${v.cites} bullets=${v.bullets}`,
    );
    if (!v.ok) {
      console.log(`  Q: ${tc.question}`);
      console.log(`  reply: ${v.reply.slice(0, 200)}`);
      if (data.error) console.log(`  error: ${data.error}`);
      if (v.phantomMarkers > 0) console.log(`  警告: 正文含 [n] 標記 ${v.phantomMarkers} 處（應由 UI 處理）`);
      if (v.docTitleOnly) console.log(`  警告: 正文僅檔名（多為未部署 grounded 或 Gemini 失敗）`);
    }
  }

  console.log("\n--- SUMMARY ---");
  for (const r of rows) {
    console.log(
      `${r.ok ? "PASS" : "FAIL"} | ${r.id} | ${r.ms}ms | bank=${r.bank} | cites=${r.cites} | ${r.preview}…`,
    );
  }
  console.log(`\n${passed}/${CASES.length} passed`);

  const logDir = path.join(webRoot, "data", "test-logs");
  fs.mkdirSync(logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logPath = path.join(logDir, `cloudrun-verify-${stamp}.json`);
  fs.writeFileSync(
    logPath,
    JSON.stringify({ baseUrl, sample, passed, total: CASES.length, rows }, null, 2),
    "utf8",
  );
  console.log("LOG:", logPath);

  process.exit(passed === CASES.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
