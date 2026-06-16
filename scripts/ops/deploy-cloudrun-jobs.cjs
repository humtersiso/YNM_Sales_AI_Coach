/**
 * 部署資料平面 Cloud Run Jobs（training-ingest、rag-sync）
 * npm run deploy:jobs:test
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const webRoot = path.join(__dirname, "..", "..");
const projectId = process.env.DEPLOY_PROJECT_ID || "gen-lang-client-0927009312";
const region = process.env.DEPLOY_REGION || "asia-east1";
const envFile = path.join(webRoot, "deploy/cloudrun-api.env.yaml");

const jobs = [
  {
    name: process.env.DEPLOY_JOB_TRAINING || "ynm-training-ingest-test",
    dockerfile: "jobs/training-ingest/Dockerfile",
  },
  {
    name: process.env.DEPLOY_JOB_RAG || "ynm-rag-sync-test",
    dockerfile: "jobs/rag-sync/Dockerfile",
  },
];

function run(command, args) {
  const r = spawnSync(command, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status || 1);
}

if (!fs.existsSync(envFile)) {
  console.error(`Missing ${envFile} — copy from deploy/cloudrun-api.env.example.yaml`);
  process.exit(1);
}

for (const job of jobs) {
  const image = `gcr.io/${projectId}/${job.name}:latest`;
  const dockerfile = path.join(webRoot, job.dockerfile);
  console.log(`[deploy-jobs] build ${image}`);
  run("gcloud", [
    "builds",
    "submit",
    webRoot,
    `--project=${projectId}`,
    `--tag=${image}`,
    `--timeout=1200s`,
    `--file=${dockerfile}`,
  ]);

  console.log(`[deploy-jobs] deploy job ${job.name}`);
  run("gcloud", [
    "run",
    "jobs",
    "deploy",
    job.name,
    `--image=${image}`,
    `--region=${region}`,
    `--project=${projectId}`,
    `--env-vars-file=${envFile}`,
    "--max-retries=1",
    "--task-timeout=3600s",
  ]);
}

console.log("Deployed jobs:", jobs.map((j) => j.name).join(", "));
