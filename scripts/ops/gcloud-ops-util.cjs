/** gcloud 共用：ADC fallback + 友善錯誤訊息（Windows / Cursor 非互動 shell） */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function adcPath() {
  const base = process.env.APPDATA || process.env.HOME || "";
  return path.join(base, "gcloud", "application_default_credentials.json");
}

function ensureGcloudAuthEnv() {
  if (process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE) return;
  const adc = adcPath();
  if (fs.existsSync(adc)) {
    process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE = adc;
  }
}

function isGcloudAuthError(text) {
  return /Reauthentication failed|cannot prompt during non-interactive|invalid_grant|Please run:\s*\n\s*\$ gcloud auth login/i.test(
    text,
  );
}

function printGcloudAuthHelp() {
  console.log("\n── gcloud 憑證已過期或未登入（Cursor 終端無法互動登入）──");
  console.log("請在本機「一般 PowerShell / CMD」依序執行：\n");
  console.log("  gcloud auth login");
  console.log("  gcloud auth application-default login");
  console.log(`  gcloud config set project gen-lang-client-0927009312\n`);
  console.log("完成後再跑：npm run ops:check-iam / ops:verify-env / ops:logs:tail");
}

/** @returns {{ ok: boolean, stdout: string, stderr: string, authError?: boolean }} */
function gcloudRun(args, { inherit = false } = {}) {
  ensureGcloudAuthEnv();
  const r = spawnSync("gcloud", args, {
    encoding: "utf8",
    shell: true,
    stdio: inherit ? "inherit" : "pipe",
  });
  const stdout = (r.stdout || "").trim();
  const stderr = (r.stderr || "").trim();
  const combined = `${stdout}\n${stderr}`;
  const authError = !inherit && r.status !== 0 && isGcloudAuthError(combined);
  return { ok: r.status === 0, stdout, stderr, authError };
}

function commandExists(cmd) {
  const which = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(which, [cmd], { encoding: "utf8", shell: true });
  return r.status === 0 && Boolean((r.stdout || "").trim());
}

module.exports = {
  adcPath,
  ensureGcloudAuthEnv,
  printGcloudAuthHelp,
  gcloudRun,
  commandExists,
  isGcloudAuthError,
};
