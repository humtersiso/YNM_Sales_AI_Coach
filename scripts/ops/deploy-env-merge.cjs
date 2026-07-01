/** deploy-cloudrun-*.cjs 共用：合併 env yaml + secrets + 本機 .env 的 GEMINI_API_KEY */
const fs = require("node:fs");
const path = require("node:path");

function parseGeminiKeyFromText(text) {
  const m = text.match(/^\s*GEMINI_API_KEY:\s*["']?([^"'\n#]+)["']?\s*$/m);
  const v = m?.[1]?.trim();
  if (!v || v.includes("your-gemini")) return null;
  return v;
}

function parseGeminiKeyFromDotEnv(dotEnvPath) {
  if (!dotEnvPath || !fs.existsSync(dotEnvPath)) return null;
  for (const line of fs.readFileSync(dotEnvPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (!t.startsWith("GEMINI_API_KEY=")) continue;
    const v = t.slice("GEMINI_API_KEY=".length).trim();
    if (v) return v;
  }
  return null;
}

function vertexOnlyFromText(text) {
  return /^GEMINI_USE_VERTEX_ONLY:\s*["']?true["']?\s*$/im.test(text);
}

function resolveGeminiApiKey({ secretsYaml, dotEnv }) {
  // 與 gemini-client 一致：web/.env 為黃金標準，勿讓 Windows 使用者環境變數蓋過
  const fromDotEnv = parseGeminiKeyFromDotEnv(dotEnv);
  if (fromDotEnv) {
    const fromOs = (process.env.GEMINI_API_KEY || "").trim();
    if (fromOs && fromOs !== fromDotEnv) {
      console.warn(
        "[deploy] 警告：Windows 使用者 GEMINI_API_KEY 與 web/.env 不同，部署將使用 .env（建議刪除過期的使用者環境變數）",
      );
    }
    return fromDotEnv;
  }
  if (secretsYaml && fs.existsSync(secretsYaml)) {
    const fromSecrets = parseGeminiKeyFromText(fs.readFileSync(secretsYaml, "utf8"));
    if (fromSecrets) return fromSecrets;
  }
  return (process.env.GEMINI_API_KEY || "").trim() || null;
}

function writeMergedEnvFile({ envFile, secretsYaml, dotEnv, tmpPath }) {
  let merged = fs.readFileSync(envFile, "utf8").trimEnd();
  const vertexOnly = vertexOnlyFromText(merged);
  const key = vertexOnly ? null : resolveGeminiApiKey({ secretsYaml, dotEnv });
  if (key && !vertexOnly) {
    if (/^GEMINI_API_KEY:/m.test(merged)) {
      merged = merged.replace(
        /^GEMINI_API_KEY:.*$/m,
        `GEMINI_API_KEY: "${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
      );
    } else {
      merged += `\nGEMINI_API_KEY: "${key.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"\n`;
    }
  }
  if (secretsYaml && fs.existsSync(secretsYaml)) {
    for (const line of fs.readFileSync(secretsYaml, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const name = t.split(":")[0]?.trim();
      if (!name || name === "GEMINI_API_KEY") continue;
      if (vertexOnly && name === "GEMINI_API_KEY") continue;
      if (!new RegExp(`^${name}:`, "m").test(merged)) {
        merged += `\n${line}`;
      }
    }
  }
  fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
  fs.writeFileSync(tmpPath, merged, "utf8");
  return { mergedPath: tmpPath, vertexOnly, geminiKey: key };
}

module.exports = {
  resolveGeminiApiKey,
  vertexOnlyFromText,
  writeMergedEnvFile,
};
