/**
 * 本地 linux/amd64 容器 — Vertex ADC 對齊 Cloud Run（非 API Key 分支）
 * npm run docker:run:local -- --build
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { webRoot, localImage, dotEnvDockerVertex } = require("./cloudrun-ops-config.cjs");
const { commandExists, adcPath } = require("./gcloud-ops-util.cjs");

const PORT = process.env.LOCAL_DOCKER_PORT || "8080";
const platform = "linux/amd64";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status || 1);
}

function dockerDaemonReady() {
  return spawnSync("docker", ["info"], { encoding: "utf8", shell: true }).status === 0;
}

function gcloudConfigDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || "", "gcloud");
  }
  return path.join(process.env.HOME || "", ".config", "gcloud");
}

function dockerVolumeSource(dir) {
  if (process.platform !== "win32") return dir;
  return dir.replace(/\\/g, "/");
}

function ensureVertexEnvFile() {
  run("node", [path.join(__dirname, "prepare-docker-vertex-env.cjs")], { stdio: "inherit" });
  if (!fs.existsSync(dotEnvDockerVertex)) {
    console.error("缺少 .env.docker.vertex");
    process.exit(1);
  }
}

function failDockerDesktop() {
  console.error("\n[docker] Docker Engine 未運行 → npm run docker:doctor\n");
  process.exit(1);
}

function main() {
  if (!commandExists("docker")) {
    console.error("找不到 docker → npm run docker:doctor");
    process.exit(1);
  }

  if (!dockerDaemonReady()) {
    console.log("[docker] 嘗試啟動 Docker Desktop…");
    const desktop = "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe";
    if (process.platform === "win32" && fs.existsSync(desktop)) {
      spawnSync("cmd", ["/c", "start", "", desktop], { shell: true });
      for (let i = 0; i < 12; i++) {
        spawnSync("ping", ["-n", "6", "127.0.0.1"], { shell: true, stdio: "ignore" });
        if (dockerDaemonReady()) break;
        console.log(`[docker] 等待 Engine… (${(i + 1) * 5}s)`);
      }
    }
    if (!dockerDaemonReady()) failDockerDesktop();
  }

  ensureVertexEnvFile();

  if (!fs.existsSync(adcPath())) {
    console.error("\n[docker] 缺少 ADC 憑證，Vertex 路徑無法運作。");
    console.error("請執行：gcloud auth application-default login\n");
    process.exit(1);
  }

  const doBuild = process.argv.includes("--build") || process.argv.includes("-b");
  process.chdir(webRoot);

  const imageExists =
    spawnSync("docker", ["image", "inspect", localImage], { encoding: "utf8", shell: true }).status === 0;

  if (doBuild || !imageExists) {
    console.log(`[docker] build --platform ${platform} → ${localImage}`);
    run("docker", ["build", "--platform", platform, "-t", localImage, "."]);
  } else {
    console.log(`[docker] 使用既有映像 ${localImage}（加 --build 可重建）`);
  }

  const gcloudDir = gcloudConfigDir();
  const vol = dockerVolumeSource(gcloudDir);

  console.log("\n[docker] 模式：Vertex ADC 對齊 Cloud Run（無 GEMINI_API_KEY）");
  console.log(`[docker] env-file: ${dotEnvDockerVertex}`);
  console.log(`[docker] ADC: ${adcPath()}\n`);

  const args = [
    "run",
    "--rm",
    "--platform",
    platform,
    "-u",
    "0",
    "-p",
    `${PORT}:8080`,
    "--env-file",
    dotEnvDockerVertex,
    "-e",
    "PORT=8080",
    "-e",
    "HOSTNAME=0.0.0.0",
    "-e",
    "GEMINI_USE_VERTEX_ONLY=true",
    "-e",
    "GEMINI_API_KEY=",
    "-e",
    "GOOGLE_APPLICATION_CREDENTIALS=/gcloud/application_default_credentials.json",
    "-v",
    `${vol}:/gcloud:ro`,
    localImage,
  ];

  console.log(`[docker] http://localhost:${PORT} （Ctrl+C 結束）`);
  console.log("驗證：");
  console.log(`  npm run test:cloudrun:chat:sample http://localhost:${PORT}`);
  console.log("  npm run test:rag-grounded:log:vertex  # 本機 CLI + ADC 對照\n");
  run("docker", args);
}

main();
