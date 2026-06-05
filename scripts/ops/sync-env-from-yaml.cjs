/**
 * 將 deploy/cloudrun-test.env.yaml 中「本機 .env 缺少」的 grounded 變數補上（不覆寫已有值）
 * 用法：npm run env:sync:cloud-test
 */
const fs = require("node:fs");
const { envYaml, dotEnv } = require("./cloudrun-ops-config.cjs");

const SYNC_KEYS = [
  "GEMINI_VERTEX_PROJECT",
  "GEMINI_VERTEX_LOCATION",
  "GEMINI_MODEL",
  "GEMINI_GROUNDING_MODEL",
  "RAG_GROUNDING_MAX_OUTPUT_TOKENS",
  "RAG_CITATION_DISPLAY_MAX",
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

function getEnvValue(text, key) {
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    if (t.slice(0, i).trim() === key) return t.slice(i + 1).trim();
  }
  return "";
}

function main() {
  if (!fs.existsSync(envYaml)) {
    console.error("找不到", envYaml);
    process.exit(1);
  }
  const yaml = parseYamlEnv(fs.readFileSync(envYaml, "utf8"));
  const existing = fs.existsSync(dotEnv) ? fs.readFileSync(dotEnv, "utf8") : "";
  const added = [];

  for (const key of SYNC_KEYS) {
    const val = (yaml[key] ?? "").trim();
    if (!val) continue;
    if (getEnvValue(existing, key)) continue;
    added.push(`${key}=${val}`);
  }

  if (added.length === 0) {
    console.log("本機 .env 已含所有 sync 項目，無需變更。");
    console.log("（APP_PUBLIC_URL 本機用 localhost 屬正常，不需與 yaml 相同）");
    return;
  }

  const suffix = [
    "",
    "# 以下由 npm run env:sync:cloud-test 自 deploy/cloudrun-test.env.yaml 補齊",
    ...added,
    "",
  ].join("\n");
  fs.writeFileSync(dotEnv, existing.trimEnd() + suffix, "utf8");
  console.log("已寫入 web/.env：", added.map((l) => l.split("=")[0]).join(", "));
  console.log("請重啟 dev server 後再測。");
}

main();
