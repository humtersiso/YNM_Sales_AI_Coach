const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectId = process.env.DEPLOY_PROJECT_ID || "gen-lang-client-0927009312";
const region = process.env.DEPLOY_REGION || "asia-east1";
const service = process.env.DEPLOY_SERVICE || "ynm-web-test";
const image = `gcr.io/${projectId}/${service}:latest`;
const envFile = "deploy/cloudrun-test.env.yaml";
const secretsYaml = "deploy/cloudrun-test.secrets.yaml";

function run(command, args) {
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
  const tmp = path.join(__dirname, "..", ".deploy-tmp", "cloudrun-test-merged.env.yaml");
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

run("gcloud", ["builds", "submit", "--tag", image, "--project", projectId]);
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
  mergedEnv,
  "--project",
  projectId,
  "--quiet",
]);

const serviceUrl = getServiceUrl();
run("gcloud", [
  "run",
  "services",
  "update",
  service,
  "--region",
  region,
  "--project",
  projectId,
  "--update-env-vars",
  `APP_PUBLIC_URL=${serviceUrl}`,
  "--quiet",
]);

console.log(`\nDeployed test service: ${serviceUrl}`);
