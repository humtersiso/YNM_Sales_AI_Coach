/**
 * 雙助手 API 煙霧測試（本機或 Cloud Run）
 * YNM_API_BASE=http://localhost:8080 YNM_API_KEY=dev npm run smoke:api
 */
const base = (process.env.YNM_API_BASE || "http://localhost:8080").replace(/\/$/, "");
const apiKey =
  process.env.YNM_API_KEY ??
  (process.env.YNM_API_AUTH_DISABLED === "1" ? "" : "dev-key");

const headers = {
  "Content-Type": "application/json",
  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  "X-YNM-User-Id": "smoke-agent",
  "X-YNM-Username": "smoke-agent",
  "X-YNM-Branch": "HQ",
};

async function check(path, init) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init?.headers } });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return text;
}

async function main() {
  const health = await check("/health");
  console.log("health:", health);

  const meta = await check("/v1/sales/knowledge-meta", { method: "GET" });
  console.log("knowledge-meta ok, bytes:", meta.length);

  const config = await check("/v1/roleplay/config-options", { method: "GET" });
  console.log("config-options ok, bytes:", config.length);

  console.log("API smoke passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
