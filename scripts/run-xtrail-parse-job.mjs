/**
 * 執行 PDF/PPT 解析（本機需已安裝 Python 依賴：pip install -r jobs/xtrail-parse/requirements.txt）
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const pyScript = path.join(webRoot, "jobs", "xtrail-parse", "main.py");
const extra = process.argv.slice(2);
const py = process.env.PYTHON || "python";

const result = spawnSync(py, [pyScript, ...extra], {
  cwd: webRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
