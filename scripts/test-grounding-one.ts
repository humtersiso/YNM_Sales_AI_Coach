import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGcpAccessToken } from "../src/lib/gemini/gemini-client";
import { chatWithVertexRagGrounding } from "../src/lib/rag/vertex-rag-grounded-chat";
import { resolveSearchPlanWithProfile } from "../src/lib/gemini/sales-intent-router";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(webRoot, ".env"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

process.env.GEMINI_GROUNDING_MODEL = "gemini-2.5-flash";

async function main() {
  const q = process.argv[2] ?? "馬力如何?";
  console.log("Q:", q);
  const { profile } = await resolveSearchPlanWithProfile(q, { productLine: "xtrail-ice" });
  console.log("profile:", profile.category);

  const t0 = Date.now();
  const r = await chatWithVertexRagGrounding(q, profile);
  console.log("model:", r.model, "| ms:", Date.now() - t0);
  console.log("corpus:", r.corpus?.slice(-12));
  console.log("chunks:", r.chunkCount, "cites:", r.citations.length);
  console.log("intro:", r.intro.slice(0, 200));
  console.log("has204:", /204\s*ps/i.test(r.rawText));
  if (r.citations[0]) {
    console.log("cite0:", r.citations[0].question.slice(0, 80));
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message?.slice(0, 400) ?? e);
  process.exit(1);
});
