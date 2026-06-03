/**
 * 將 Gemini Data Agent 的 BQ 資料源改為指定 dataset（預設 YNM_Sales_AI_Coach_test）
 * 用法：node scripts/update-data-agent-dataset.cjs [--dataset=YNM_Sales_AI_Coach_test]
 */
const fs = require("node:fs");
const path = require("node:path");
const { GoogleAuth } = require("google-auth-library");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const projectId =
  process.env.GEMINI_DATA_ANALYTICS_PROJECT ||
  process.env.BIGQUERY_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GEMINI_DATA_ANALYTICS_LOCATION || "global";
const agentId = process.env.GEMINI_DATA_ANALYTICS_AGENT_ID;

const datasetArg = process.argv.find((a) => a.startsWith("--dataset="));
const datasetId = datasetArg
  ? datasetArg.split("=")[1]
  : process.env.BIGQUERY_DATASET || "YNM_Sales_AI_Coach_test";

const tables = ["v_sales_knowledge", "knowledge_units", "source_assets"];

async function getToken() {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  if (!t.token) throw new Error("無法取得 access token");
  return t.token;
}

async function main() {
  if (!projectId || !agentId) {
    console.error("請設定 BIGQUERY_PROJECT_ID 與 GEMINI_DATA_ANALYTICS_AGENT_ID");
    process.exit(1);
  }

  const base = `https://geminidataanalytics.googleapis.com/v1beta/projects/${projectId}/locations/${location}/dataAgents/${agentId}`;
  const token = await getToken();

  const getRes = await fetch(base, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const current = await getRes.json();
  if (!getRes.ok) {
    console.error("GET agent failed", getRes.status, JSON.stringify(current, null, 2));
    process.exit(1);
  }

  const tableReferences = tables.map((tableId) => ({
    projectId,
    datasetId,
    tableId,
  }));

  const patchBody = {
    ...current,
    dataAnalyticsAgent: {
      ...(current.dataAnalyticsAgent || {}),
      publishedContext: {
        ...(current.dataAnalyticsAgent?.publishedContext || {}),
        datasourceReferences: {
          bq: { tableReferences },
        },
      },
    },
  };

  const updateMask =
    "dataAnalyticsAgent.publishedContext.datasourceReferences";

  const patchRes = await fetch(`${base}?updateMask=${encodeURIComponent(updateMask)}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patchBody),
  });

  const patched = await patchRes.json();
  if (!patchRes.ok) {
    console.error("PATCH agent failed", patchRes.status, JSON.stringify(patched, null, 2));
    process.exit(1);
  }

  const refs =
    patched.dataAnalyticsAgent?.publishedContext?.datasourceReferences?.bq
      ?.tableReferences ?? [];

  console.log(
    JSON.stringify(
      {
        ok: true,
        agentId,
        datasetId,
        tables,
        updatedReferences: refs,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
