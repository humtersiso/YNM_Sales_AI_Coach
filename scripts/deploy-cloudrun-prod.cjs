const { spawnSync } = require("node:child_process");

const projectId = process.env.DEPLOY_PROJECT_ID || "gen-lang-client-0927009312";
const region = process.env.DEPLOY_REGION || "asia-east1";
const service = process.env.DEPLOY_SERVICE || "ynm-web-prod";
const image = `gcr.io/${projectId}/${service}:latest`;
const envFile = "deploy/cloudrun-prod.env.yaml";

function run(command, args) {
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
  envFile,
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

console.log(`\nDeployed prod service: ${serviceUrl}`);
