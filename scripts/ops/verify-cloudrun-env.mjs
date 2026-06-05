/**
 * 對照本機 .env、deploy/cloudrun-test.env.yaml 與 Cloud Run 已部署變數
 * 用法：npm run ops:verify-env
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { projectId, region, service, envYaml, secretsYaml, dotEnv } = require("./cloudrun-ops-config.cjs");
const { gcloudRun, printGcloudAuthHelp } = require("./gcloud-ops-util.cjs");

/** 本機與雲端預期不同，不算錯誤 */
const EXPECT_LOCAL_DIFF = new Set(["APP_PUBLIC_URL"]);

/** grounded + augment 路徑必要變數（不含 secret 本體，只檢查是否有設定） */
const REQUIRED_FOR_GROUNDED = [
  "SALES_CHAT_MODE",
  "SALES_KNOWLEDGE_BACKEND",
  "SALES_RAG_GROUNDING_IMPL",
  "RAG_PROJECT_ID",
  "RAG_ENGINE_LOCATION",
  "RAG_CORPUS_SALES_SCRIPT",
  "RAG_CORPUS_COMPETITOR",
  "RAG_CORPUS_PRODUCT",
  "GEMINI_VERTEX_PROJECT",
  "GEMINI_VERTEX_LOCATION",
  "GEMINI_MODEL",
  "AUTH_SESSION_SECRET",
  "APP_PUBLIC_URL",
];

const SECRET_OR_LOCAL_ONLY = ["GEMINI_API_KEY"];

function parseYamlEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf(":");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parseDotEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function gcloudEnvOnService() {
  const r = gcloudRun([
    "run",
    "services",
    "describe",
    service,
    "--region",
    region,
    "--project",
    projectId,
    "--format=json(spec.template.spec.containers[0].env)",
  ]);
  if (!r.ok) return { env: null, authError: r.authError, error: r.stderr || r.stdout };
  try {
    let parsed = JSON.parse(r.stdout || "null");
    if (parsed && !Array.isArray(parsed) && parsed.env) parsed = parsed.env;
    if (!Array.isArray(parsed)) parsed = [];
    const out = {};
    for (const item of parsed) {
      if (item.name && item.value != null) out[item.name] = item.value;
      if (item.name && item.valueFrom) out[item.name] = "(secret)";
    }
    return { env: out, authError: false, error: "" };
  } catch (e) {
    return { env: null, authError: false, error: String(e) };
  }
}

function reportBlock(title, map, keys) {
  console.log(`\n${title}`);
  let missing = 0;
  for (const k of keys) {
    const v = (map[k] ?? "").trim();
    if (!v) {
      console.log(`  ✗ 缺少 ${k}`);
      missing += 1;
    } else if (SECRET_OR_LOCAL_ONLY.includes(k)) {
      console.log(`  ✓ ${k}=（已設定，長度 ${v.length}）`);
    } else {
      const preview = v.length > 56 ? `${v.slice(0, 53)}…` : v;
      console.log(`  ✓ ${k}=${preview}`);
    }
  }
  return missing;
}

function diffKeys(a, b, labelA, labelB) {
  const mism = [];
  for (const k of REQUIRED_FOR_GROUNDED) {
    if (EXPECT_LOCAL_DIFF.has(k)) continue;
    const va = (a[k] ?? "").trim();
    const vb = (b[k] ?? "").trim();
    if (va && vb && va !== vb) mism.push({ k, va, vb });
  }
  if (mism.length === 0) return;
  console.log(`\n${labelA} vs ${labelB} 值不一致（可能導致本機與雲端回答不同）：`);
  for (const { k, va, vb } of mism) {
    console.log(`  • ${k}`);
    console.log(`      ${labelA}: ${va.slice(0, 70)}`);
    console.log(`      ${labelB}: ${vb.slice(0, 70)}`);
  }
}

function main() {
  console.log("Cloud Run 環境變數對照（不修改回答流程，僅診斷）\n");

  const local = fs.existsSync(dotEnv) ? parseDotEnv(fs.readFileSync(dotEnv, "utf8")) : {};
  const yaml = fs.existsSync(envYaml) ? parseYamlEnv(fs.readFileSync(envYaml, "utf8")) : {};
  if (fs.existsSync(secretsYaml)) {
    const sec = parseYamlEnv(fs.readFileSync(secretsYaml, "utf8"));
    for (const [k, v] of Object.entries(sec)) {
      if (v && !yaml[k]) yaml[k] = v;
    }
  }

  let exit = 0;
  exit += reportBlock("本機 .env", local, [...REQUIRED_FOR_GROUNDED, ...SECRET_OR_LOCAL_ONLY]);
  exit += reportBlock("deploy/cloudrun-test.env.yaml（+ secrets）", yaml, REQUIRED_FOR_GROUNDED);

  const hasLocalGemini = Boolean((local.GEMINI_API_KEY ?? "").trim());
  const cloudUsesAdc = !hasLocalGemini;
  console.log(
    `\n認證路徑：本機 ${hasLocalGemini ? "GEMINI_API_KEY（Developer API）+ 個人 ADC 查 RAG" : "僅 ADC（與 Cloud Run 較接近）"}`,
  );
  console.log(
    `         雲端 預期為服務帳號 ADC（請勿依賴本機 .env 自動帶上雲端）`,
  );

  diffKeys(local, yaml, ".env", "yaml");
  if (EXPECT_LOCAL_DIFF.has("APP_PUBLIC_URL")) {
    console.log("\n（略過 APP_PUBLIC_URL：本機 localhost / 雲端 Run URL 本來就不同）");
  }

  const remoteResult = gcloudEnvOnService();
  if (!remoteResult.env) {
    console.log("\n無法讀取 Cloud Run 已部署 env。");
    if (remoteResult.authError) printGcloudAuthHelp();
    else if (remoteResult.error) console.log("  gcloud:", remoteResult.error.slice(0, 400));
    else console.log("  請確認 gcloud 可 describe Cloud Run 服務。");
    if (exit > 0) console.log("\n本機缺少變數可執行：npm run env:sync:cloud-test");
    process.exit(exit > 0 ? 1 : 0);
  }

  const remote = remoteResult.env;

  exit += reportBlock("Cloud Run 已部署", remote, REQUIRED_FOR_GROUNDED);
  diffKeys(yaml, remote, "yaml", "Cloud Run");

  if (exit > 0) {
    console.log("\n本機缺少變數可執行：npm run env:sync:cloud-test");
    console.log("修正後：npm run deploy:test:env（雲端）");
    process.exit(1);
  }
  console.log("\n必要變數檢查通過。");
}

main();
