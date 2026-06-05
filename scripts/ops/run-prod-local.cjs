/**
 * 無 Docker 時：本機 production build（同 Cloud Run standalone）
 * npm run run:prod-local
 * npm run run:prod-local -- --vertex   # 對齊 Cloud Run Vertex 路徑
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { webRoot, dotEnv, dotEnvDockerVertex } = require("./cloudrun-ops-config.cjs");

const PORT = process.env.LOCAL_PORT || "8080";
const vertex = process.argv.includes("--vertex");

function loadEnvFile(filePath) {
  const env = { ...process.env };
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function run(env) {
  const r = spawnSync("npm", ["run", "build"], { stdio: "inherit", shell: true, cwd: webRoot, env });
  if (r.status !== 0) process.exit(r.status || 1);
  console.log(`\n[prod-local] next start → http://localhost:${PORT}`);
  if (vertex) console.log("[prod-local] 模式：Vertex ADC（GEMINI_USE_VERTEX_ONLY）\n");
  const r2 = spawnSync("npm", ["run", "start", "--", "-p", PORT], {
    stdio: "inherit",
    shell: true,
    cwd: webRoot,
    env,
  });
  if (r2.status !== 0) process.exit(r2.status || 1);
}

function main() {
  if (vertex) {
    spawnSync("node", [path.join(__dirname, "prepare-docker-vertex-env.cjs")], {
      stdio: "inherit",
      shell: true,
    });
    if (!fs.existsSync(dotEnvDockerVertex)) process.exit(1);
    const env = loadEnvFile(dotEnvDockerVertex);
    env.GEMINI_USE_VERTEX_ONLY = "true";
    delete env.GEMINI_API_KEY;
    env.PORT = PORT;
    console.log("[prod-local] next build…");
    run(env);
    return;
  }

  if (!fs.existsSync(dotEnv)) {
    console.error("找不到 web/.env");
    process.exit(1);
  }
  console.log("[prod-local] next build…");
  run({ ...process.env, PORT });
}

main();
