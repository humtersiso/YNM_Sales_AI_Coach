/** 快速驗證 Vertex global + gemini-3.1-flash-lite 是否可用 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geminiGenerateText } from "../../src/lib/gemini/gemini-client";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = path.join(webRoot, ".env.docker.vertex");

for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}
delete process.env.GEMINI_API_KEY;
process.env.GEMINI_USE_VERTEX_ONLY = "true";

async function main() {
  const text = await geminiGenerateText("用一句話回答：TUCSON L 長期持有成本重點是什麼？", {
    maxOutputTokens: 128,
  });
  console.log(text ? `OK: ${text.slice(0, 240)}` : "FAIL: null response");
  process.exitCode = text ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
