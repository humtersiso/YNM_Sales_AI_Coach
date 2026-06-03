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

const projectId = process.env.GEMINI_DATA_ANALYTICS_PROJECT || process.env.BIGQUERY_PROJECT_ID;
const location = process.env.GEMINI_DATA_ANALYTICS_LOCATION || "global";
const agentId = process.env.GEMINI_DATA_ANALYTICS_AGENT_ID;

async function main() {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const token = (await (await auth.getClient()).getAccessToken()).token;
  const url = `https://geminidataanalytics.googleapis.com/v1beta/projects/${projectId}/locations/${location}:chat`;

  const body = {
    parent: `projects/${projectId}/locations/global`,
    messages: [
      {
        userMessage: {
          text: "TERRITORY_YT負評影片有哪些重點？請用繁體中文3條列點，不要表格。",
        },
      },
    ],
    data_agent_context: {
      data_agent: `projects/${projectId}/locations/${location}/dataAgents/${agentId}`,
    },
  };
  const thinkingMode = (process.env.GEMINI_DATA_AGENT_THINKING_MODE || "").trim().toUpperCase();
  if (thinkingMode === "FAST" || thinkingMode === "THINKING") {
    body.thinkingMode = thinkingMode;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const out = path.join(__dirname, "..", "data", "data-agent-raw-response.txt");
  fs.writeFileSync(out, `status=${res.status}\n\n${text}`, "utf8");
  console.log("saved", out, "len", text.length, "status", res.status);
}

main().catch(console.error);
