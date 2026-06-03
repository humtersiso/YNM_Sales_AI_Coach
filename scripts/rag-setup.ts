/**
 * 建立三個 CONTENT_REQUIRED 語料庫（若不存在）並輸出 .env 片段
 * 用法：npx tsx scripts/rag-setup.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createContentRequiredDataStore,
  defaultRagProjectId,
} from "../src/lib/rag/rag-document-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(webRoot, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const STORES = [
  {
    id: "ynm-sales-script",
    displayName: "YNM 話術 QA",
    env: "RAG_DATASTORE_SALES_SCRIPT",
  },
  {
    id: "ynm-competitor-compare",
    displayName: "YNM 競品比較",
    env: "RAG_DATASTORE_COMPETITOR",
  },
  {
    id: "ynm-product-info",
    displayName: "YNM 本品資訊",
    env: "RAG_DATASTORE_PRODUCT",
  },
] as const;

async function main() {
  loadEnv();
  const projectId = defaultRagProjectId();
  const lines: string[] = [
    "# --- RAG（由 npm run rag:setup 產生）---",
    "SALES_KNOWLEDGE_BACKEND=rag",
    `RAG_PROJECT_ID=${process.env.RAG_PROJECT_ID ?? "gen-lang-client-0927009312"}`,
    "RAG_LOCATION=global",
  ];

  for (const s of STORES) {
    const resource = await createContentRequiredDataStore(projectId, s.id, s.displayName);
    console.log("OK", s.displayName, resource);
    lines.push(`${s.env}=${resource}`);
  }

  const outPath = path.join(webRoot, "config", "rag-env.generated.txt");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
  console.log("\n已寫入", outPath);
  console.log("請將上述變數複製到 .env，然後執行：npm run rag:ingest");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
