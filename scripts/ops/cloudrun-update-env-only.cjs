const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const webRoot = path.join(__dirname, "..", "..");
const envFile = path.join(webRoot, "deploy/cloudrun-test.env.yaml");
const secretsYaml = path.join(webRoot, "deploy/cloudrun-test.secrets.yaml");

let merged = fs.readFileSync(envFile, "utf8").trimEnd();
if (fs.existsSync(secretsYaml) && !/^GEMINI_API_KEY:/m.test(merged)) {
  const m = fs.readFileSync(secretsYaml, "utf8").match(/GEMINI_API_KEY:\s*["']?([^"'\n#]+)/);
  if (m?.[1]?.trim() && !m[1].includes("your-gemini")) {
    merged += `\nGEMINI_API_KEY: "${m[1].trim()}"\n`;
  }
}
const tmp = path.join(webRoot, ".deploy-tmp/merged.env.yaml");
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, merged, "utf8");

const projectId = process.env.DEPLOY_PROJECT_ID || "gen-lang-client-0927009312";
const region = process.env.DEPLOY_REGION || "asia-east1";
const service = process.env.DEPLOY_SERVICE || "ynm-web-test";
const image = `gcr.io/${projectId}/${service}:latest`;

console.log("[env-only] SALES_CHAT_MODE from file:", /SALES_CHAT_MODE:\s*(\S+)/.exec(merged)?.[1]);

const r = spawnSync(
  "gcloud",
  [
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
    tmp,
    "--project",
    projectId,
    "--quiet",
  ],
  { stdio: "inherit", shell: true, cwd: webRoot },
);
process.exit(r.status || 0);
