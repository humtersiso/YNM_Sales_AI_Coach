/**
 * 部署 ynm-assistants-api（雙助手 API-only，不含 Next.js UI）
 * npm run deploy:api:test
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const webRoot = path.join(__dirname, "..", "..");
const projectId = process.env.DEPLOY_PROJECT_ID || "gen-lang-client-0927009312";
const region = process.env.DEPLOY_REGION || "asia-east1";
const service = process.env.DEPLOY_API_SERVICE || "ynm-assistants-api-test";
const image = `gcr.io/${projectId}/${service}:latest`;
const envFile = path.join(webRoot, "deploy/cloudrun-api.env.yaml");
const dockerfile = path.join(webRoot, "apps/api-server/Dockerfile");

function run(command, args) {
  const r = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status || 1);
}

if (!fs.existsSync(envFile)) {
  console.error(`Missing ${envFile} — copy from deploy/cloudrun-api.env.example.yaml`);
  process.exit(1);
}

console.log(`[deploy-api] build ${image}`);
run("gcloud", [
  "builds",
  "submit",
  webRoot,
  `--project=${projectId}`,
  `--tag=${image}`,
  `--timeout=1200s`,
  `--machine-type=E2_HIGHCPU_8`,
  `--file=${dockerfile}`,
]);

console.log(`[deploy-api] deploy ${service}`);
run("gcloud", [
  "run",
  "deploy",
  service,
  `--image=${image}`,
  `--region=${region}`,
  `--project=${projectId}`,
  "--platform=managed",
  `--env-vars-file=${envFile}`,
  "--allow-unauthenticated",
]);

console.log(`Deployed API service: ${service}`);
