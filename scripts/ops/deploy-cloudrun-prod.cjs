const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { writeMergedEnvFile } = require("./deploy-env-merge.cjs");

const webRoot = path.join(__dirname, "..", "..");
const projectId = process.env.DEPLOY_PROJECT_ID || "gen-lang-client-0927009312";
const region = process.env.DEPLOY_REGION || "asia-east1";
const service = process.env.DEPLOY_SERVICE || "ynm-web-prod";
const image = `gcr.io/${projectId}/${service}:latest`;
const envFile = path.join(webRoot, "deploy/cloudrun-prod.env.yaml");
const secretsYaml = path.join(webRoot, "deploy/cloudrun-prod.secrets.yaml");
const dotEnv = path.join(webRoot, ".env");

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

const tmpMerged = path.join(webRoot, ".deploy-tmp", "cloudrun-prod-merged.env.yaml");
const { mergedPath, vertexOnly, geminiKey } = writeMergedEnvFile({
  envFile,
  secretsYaml: fs.existsSync(secretsYaml)
    ? secretsYaml
    : path.join(webRoot, "deploy/cloudrun-test.secrets.yaml"),
  dotEnv,
  tmpPath: tmpMerged,
});

if (vertexOnly) {
  console.log("[deploy:prod] GEMINI_USE_VERTEX_ONLY=true — 使用 Vertex ADC，不注入 GEMINI_API_KEY");
} else if (!geminiKey) {
  console.warn(
    "\n[deploy:prod] 警告：未找到 GEMINI_API_KEY（環境變數 / cloudrun-prod.secrets.yaml / .env）。" +
      "雲端將 fallback Vertex，可能與本機品質不一致。\n",
  );
} else {
  console.log("[deploy:prod] 將帶入 GEMINI_API_KEY（長度 %d），與本機 Developer API 對齊", geminiKey.length);
}

if (!envOnly) {
  run("gcloud", ["builds", "submit", webRoot, "--tag", image, "--project", projectId]);
} else {
  console.log("[deploy:prod] DEPLOY_ENV_ONLY=1 — 略過映像建置，僅更新服務設定");
}

let mergedForDeploy = fs.readFileSync(mergedPath, "utf8");
const knownServiceUrl =
  process.env.CLOUDRUN_URL?.trim() || `https://${service}-mer5dwhswq-de.a.run.app`;
if (!/^APP_PUBLIC_URL:/m.test(mergedForDeploy)) {
  mergedForDeploy += `\nAPP_PUBLIC_URL: "${knownServiceUrl}"\n`;
} else {
  mergedForDeploy = mergedForDeploy.replace(
    /^APP_PUBLIC_URL:.*$/m,
    `APP_PUBLIC_URL: "${knownServiceUrl}"`,
  );
}
const deployEnv = path.join(webRoot, ".deploy-tmp", "cloudrun-prod-deploy.env.yaml");
fs.writeFileSync(deployEnv, mergedForDeploy, "utf8");

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
console.log(`\nDeployed prod service: ${serviceUrl}`);
console.log("僅改 env、不重建映像：npm run deploy:prod:env");
