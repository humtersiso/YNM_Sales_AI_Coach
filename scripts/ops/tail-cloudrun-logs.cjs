/**
 * 即時 tail Cloud Run 日誌（對照本機除錯）
 * 用法：npm run ops:logs:tail
 */
const { projectId, region, service } = require("./cloudrun-ops-config.cjs");
const { gcloudRun, printGcloudAuthHelp } = require("./gcloud-ops-util.cjs");

console.log(`監聽 Cloud Run 日誌：${service} (${region})`);
console.log("請保持此視窗開啟，並在瀏覽器重現問題…\n");

const r = gcloudRun(
  ["beta", "run", "services", "logs", "tail", service, "--region", region, "--project", projectId],
  { inherit: true },
);
if (r.authError) {
  printGcloudAuthHelp();
  process.exit(1);
}
process.exit(r.ok ? 0 : 1);
