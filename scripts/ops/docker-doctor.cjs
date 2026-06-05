/**
 * Windows / Docker Desktop 啟動前診斷
 * 用法：npm run docker:doctor
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { commandExists, adcPath } = require("./gcloud-ops-util.cjs");

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8", shell: true });
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

function main() {
  console.log("Docker 本地測試診斷（對齊 Cloud Run linux/amd64）");

  section("1. Docker CLI");
  if (!commandExists("docker")) {
    console.log("✗ 找不到 docker 命令 → 請安裝 Docker Desktop");
    printFix();
    process.exit(1);
  }
  console.log("✓ docker 已在 PATH");

  section("2. Docker Engine（daemon）");
  const info = run("docker", ["info"]);
  const infoText = `${info.stdout}${info.stderr}`;
  if (info.status !== 0) {
    console.log("✗ Docker Engine 未運行");
    if (/unable to start/i.test(infoText)) {
      console.log("  原因：Docker Desktop 無法啟動（常見於 WSL2 未就緒）");
    } else {
      console.log(info.stderr?.slice(0, 300) || info.stdout?.slice(0, 300));
    }
    printFix();
    process.exit(1);
  }
  console.log("✓ Docker Engine 運行中");

  section("3. WSL（Docker Desktop 後端）");
  const wsl = run("wsl", ["--status"]);
  const wslList = run("wsl", ["-l", "-v"]);
  console.log((wsl.stdout || wsl.stderr || "").trim().slice(0, 400));
  const distros = (wslList.stdout || "").trim();
  if (distros) console.log(distros);
  if (/需要更新|update|kernel/i.test(`${wsl.stdout}${wsl.stderr}`)) {
    console.log("\n⚠ 請在「系統管理員 PowerShell」執行：wsl --update");
  }
  if (!/Running|Ubuntu|docker-desktop/i.test(wslList.stdout || "")) {
    console.log("⚠ 建議安裝 WSL2 發行版：wsl --install -d Ubuntu");
  }

  section("4. Google ADC（容器內 RAG 用）");
  const adc = adcPath();
  if (fs.existsSync(adc)) {
    console.log(`✓ ${adc}`);
  } else {
    console.log("✗ 缺少 application_default_credentials.json");
    console.log("  請執行：gcloud auth application-default login");
  }

  section("5. 本機 .env");
  const dotEnv = path.join(__dirname, "..", "..", ".env");
  if (fs.existsSync(dotEnv)) {
    console.log(`✓ ${dotEnv}`);
  } else {
    console.log("✗ 缺少 web/.env → npm run env:sync:cloud-test");
  }

  console.log("\n全部就緒後執行：");
  console.log("  npm run docker:run:local -- --build");
  console.log("  npm run test:cloudrun:chat:sample http://localhost:8080");
}

function printFix() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("Windows 修復步驟（需系統管理員 PowerShell，依序執行）：");
  console.log("══════════════════════════════════════════════════");
  console.log(`
1. 更新 WSL2 核心：
   wsl --update

2. 若尚未安裝 Linux 發行版：
   wsl --install -d Ubuntu
   （完成後重開機）

3. 啟動 Docker Desktop（開始功能表 → Docker Desktop）
   等待右下角鯨魚圖示顯示 "Engine running"

4. 驗證：
   docker info

5. 回到專案：
   cd C:\\Yulon\\YNM_poc\\web
   npm run docker:doctor
   npm run docker:run:local -- --build

若公司 PC 無法啟用 WSL，改用（不需 Docker）：
   npm run run:prod-local
`);
}

main();
