/**
 * 產生 .env.docker.vertex — 與 Cloud Run 相同：Vertex ADC、無 GEMINI_API_KEY
 * 用法：npm run env:prepare:docker-vertex
 *
 * 雙線並行：
 *   .env（API Key）= 本機黃金標準 dev / test:rag-grounded:log
 *   .env.docker.vertex + ADC = Docker / Cloud Run 對齊驗證
 */
const fs = require("node:fs");
const path = require("node:path");
const { webRoot, dotEnv, envYaml } = require("./cloudrun-ops-config.cjs");

const OUT = path.join(webRoot, ".env.docker.vertex");

/** 以 yaml 覆寫，對齊 deploy/cloudrun-test.env.yaml（02:45 黃金 log 時段設定） */
const YAML_OVERRIDES = [
  "RAG_GROUNDING_MAX_OUTPUT_TOKENS",
  "SALES_SUMMARIZE_MAX_OUTPUT_TOKENS",
  "RAG_GROUNDING_TOP_K",
  "SALES_GROUNDED_RETRIEVE_FIRST",
  "SALES_CHAT_FAST",
  "GEMINI_VERTEX_PROJECT",
  "GEMINI_VERTEX_LOCATION",
  "GEMINI_MODEL",
  "GEMINI_GROUNDING_MODEL",
  "SALES_NEVER_DATA_AGENT",
  "SALES_SKIP_DATA_AGENT_ON_HIT",
];

function parseYamlEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf(":");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parseDotEnv(text) {
  const lines = [];
  const map = {};
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t || t.startsWith("#")) {
      lines.push(raw);
      continue;
    }
    const i = t.indexOf("=");
    if (i <= 0) {
      lines.push(raw);
      continue;
    }
    const key = t.slice(0, i).trim();
    const val = t.slice(i + 1).trim();
    map[key] = val;
    lines.push(raw);
  }
  return { lines, map };
}

function main() {
  if (!fs.existsSync(dotEnv)) {
    console.error("找不到 web/.env");
    process.exit(1);
  }

  const yaml = fs.existsSync(envYaml) ? parseYamlEnv(fs.readFileSync(envYaml, "utf8")) : {};
  const { map } = parseDotEnv(fs.readFileSync(dotEnv, "utf8"));

  for (const k of YAML_OVERRIDES) {
    if (yaml[k] != null && String(yaml[k]).trim() !== "") map[k] = String(yaml[k]).trim();
  }

  delete map.GEMINI_API_KEY;
  map.GEMINI_USE_VERTEX_ONLY = "true";
  map.APP_PUBLIC_URL = process.env.DOCKER_APP_PUBLIC_URL || "http://localhost:8080";

  const header = [
    "# 自動產生 — npm run env:prepare:docker-vertex",
    "# 用途：Docker / Vertex ADC 對齊 Cloud Run（勿含 GEMINI_API_KEY）",
    "# 本機黃金標準請繼續用 .env + API Key",
    "",
  ];

  const skipKeys = new Set(["GEMINI_API_KEY"]);
  const body = Object.entries(map)
    .filter(([k]) => !skipKeys.has(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);

  fs.writeFileSync(OUT, [...header, ...body, ""].join("\n"), "utf8");

  console.log("已寫入:", OUT);
  console.log("  GEMINI_USE_VERTEX_ONLY=true");
  console.log("  GEMINI_API_KEY=（已移除）");
  console.log(`  GEMINI_VERTEX_PROJECT=${map.GEMINI_VERTEX_PROJECT ?? "?"}`);
  console.log(`  GEMINI_MODEL=${map.GEMINI_MODEL ?? "?"}`);
  console.log("\n下一步：");
  console.log("  gcloud auth application-default login");
  console.log("  npm run docker:run:local -- --build");
  console.log("  npm run test:rag-grounded:log:vertex   # 本機 CLI + ADC，無 Docker");
}

main();
