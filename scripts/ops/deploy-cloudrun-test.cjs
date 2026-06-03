const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const webRoot = path.join(__dirname, "..", "..");
const projectId = process.env.DEPLOY_PROJECT_ID || "gen-lang-client-0927009312";
const region = process.env.DEPLOY_REGION || "asia-east1";
const service = process.env.DEPLOY_SERVICE || "ynm-web-test";
const image = `gcr.io/${projectId}/${service}:latest`;
const envFile = path.join(webRoot, "deploy/cloudrun-test.env.yaml");
const secretsYaml = path.join(webRoot, "deploy/cloudrun-test.secrets.yaml");

/** Cursor 等非互動 shell 常無法用 gcloud user creds；ADC 登入後可自動 fallback */
function ensureGcloudAuthEnv() {
  if (process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE) return;
  const adc = path.join(
    process.env.APPDATA || process.env.HOME || "",
    "gcloud",
    "application_default_credentials.json",
  );
  if (adc && fs.existsSync(adc)) {
    process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE = adc;
  }
}

function run(command, args) {
  ensureGcloudAuthEnv();
  const r = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
}

function parseGeminiKeyFromSecretsYaml() {
  if (!fs.existsSync(secretsYaml)) return null;
  const text = fs.readFileSync(secretsYaml, "utf8");
  const m = text.match(/^\s*GEMINI_API_KEY:\s*["']?([^"'\n#]+)["']?\s*$/m);
  const v = m?.[1]?.trim();
  if (!v || v.includes("your-gemini")) return null;
  return v;
}

function resolveGeminiApiKey() {
  const fromEnv = (process.env.GEMINI_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  return parseGeminiKeyFromSecretsYaml();
}

/** 合併 base env + secrets（供 gcloud --env-vars-file） */
function writeMergedEnvFile() {
  let merged = fs.readFileSync(envFile, "utf8").trimEnd();
  const key = resolveGeminiApiKey();
  if (key && !/^GEMINI_API_KEY:/m.test(merged)) {
    merged += `\nGEMINI_API_KEY: "${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"\n`;
  }
  if (fs.existsSync(secretsYaml)) {
    for (const line of fs.readFileSync(secretsYaml, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const name = t.split(":")[0]?.trim();
      if (!name || name === "GEMINI_API_KEY") continue;
      if (!new RegExp(`^${name}:`, "m").test(merged)) {
        merged += `\n${line}`;
      }
    }
  }
  const tmp = path.join(webRoot, ".deploy-tmp", "cloudrun-test-merged.env.yaml");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, merged, "utf8");
  return tmp;
}

function getServiceUrl() {
  const r = spawnSync(
    "gcloud",
    ["run", "services", "describe", service, "--region", region, "--project", projectId, "--format=value(status.url)"],
    { encoding: "utf8", shell: true },
  );
  if (r.status !== 0) {
    process.exit(r.status || 1);
  }
  return (r.stdout || "").trim();
}

const envOnly =
  process.argv.includes("--env-only") ||
  ["1", "true", "yes"].includes(String(process.env.DEPLOY_ENV_ONLY ?? "").trim().toLowerCase());

const mergedEnv = writeMergedEnvFile();
const geminiKey = resolveGeminiApiKey();
if (!geminiKey) {
  console.warn(
    "\n[deploy] 警告：未設定 GEMINI_API_KEY（環境變數或 deploy/cloudrun-test.secrets.yaml）。" +
      "data-agent 快路徑可能失敗而變慢。\n",
  );
} else {
  console.log("[deploy] 將帶入 GEMINI_API_KEY（長度 %d）", geminiKey.length);
}

if (!envOnly) {
  const cloudbuild = path.join(webRoot, "cloudbuild.yaml");
  if (!fs.existsSync(cloudbuild)) {
    console.error("[deploy] 找不到 cloudbuild.yaml");
    process.exit(1);
  }
  console.log("[deploy] Cloud Build（E2_HIGHCPU_8）→ %s", image);
  run("gcloud", [
    "builds",
    "submit",
    webRoot,
    "--config",
    cloudbuild,
    "--project",
    projectId,
  ]);
} else {
  console.log("[deploy] DEPLOY_ENV_ONLY=1 — 略過映像建置，僅更新服務設定");
}
/** 已知 test 服務網址，併入首次 deploy 省掉第二輪 revision（約 30–60 秒） */
const knownServiceUrl =
  process.env.CLOUDRUN_URL?.trim() ||
  `https://${service}-653828324568.${region}.run.app`;
let mergedForDeploy = fs.readFileSync(mergedEnv, "utf8");
if (!/^APP_PUBLIC_URL:/m.test(mergedForDeploy)) {
  mergedForDeploy += `\nAPP_PUBLIC_URL: "${knownServiceUrl}"\n`;
} else {
  mergedForDeploy = mergedForDeploy.replace(
    /^APP_PUBLIC_URL:.*$/m,
    `APP_PUBLIC_URL: "${knownServiceUrl}"`,
  );
}
const deployEnv = path.join(webRoot, ".deploy-tmp", "cloudrun-deploy.env.yaml");
fs.writeFileSync(deployEnv, mergedForDeploy, "utf8");

/** cloudbuild 已 deploy 一輪；此步併入 GEMINI 等 secrets 與 APP_PUBLIC_URL */
run("gcloud", [
  "run",
  "deploy",
  service,
  "--image",
  image,
  "--region",
  region,
  "--platform",
  "managed",
  "--allow-unauthenticated",
  "--env-vars-file",
  deployEnv,
  "--project",
  projectId,
  "--quiet",
]);

const serviceUrl = getServiceUrl();
console.log(`\nDeployed test service: ${serviceUrl}`);
console.log("僅改 env、不重建映像：npm run deploy:test:env");
