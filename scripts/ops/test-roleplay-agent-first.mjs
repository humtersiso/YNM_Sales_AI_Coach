/**
 * 煙測：業代先發對話流程
 * 開局 → 確認 agentSpeaksFirst → bootstrap 不顯示客戶訊息 → 第一輪 /turn 回傳開場 → 第二輪正常對話 → 評分
 * 用法：node scripts/ops/test-roleplay-agent-first.mjs [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(webRoot, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
    }
    break;
  }
}

loadEnv();

const baseUrl = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
const password = process.env.SEED_ADMIN_PASSWORD ?? "";

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length) return raw.map((c) => c.split(";")[0]).join("; ");
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

async function api(cookie, method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function main() {
  console.log(`業代先發對話流程煙測 @ ${baseUrl}\n`);

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!loginRes.ok) throw new Error(`登入失敗 ${loginRes.status}`);
  const cookie = cookieFrom(loginRes);
  console.log("✓ admin 登入");

  const { res: optRes, data: opt } = await api(cookie, "GET", "/api/roleplay/config-options");
  if (!optRes.ok) throw new Error(`config-options ${optRes.status}`);
  const competitor = opt.competitors?.[0];
  if (!competitor) throw new Error("無競品選項");

  const { res: startRes, data: start } = await api(cookie, "POST", "/api/roleplay/sessions", {
    mode: "custom",
    config: {
      productLine: opt.products[0].id,
      personaId: opt.personas?.[0]?.id ?? "P-01",
      ageRange: "30-40",
      competitor,
      maxTurns: 3,
      difficulty: "beginner",
    },
  });
  if (!startRes.ok) throw new Error(`開局失敗 ${startRes.status}: ${start.error ?? JSON.stringify(start)}`);
  if (!start.sessionId || !start.customerMessage?.trim()) {
    throw new Error("開局回應缺少 sessionId 或 customerMessage");
  }
  if (!start.agentSpeaksFirst) {
    throw new Error("開局回應應含 agentSpeaksFirst: true");
  }
  console.log(`✓ 開局 session=${start.sessionId} agentSpeaksFirst=true`);

  if (!start.coachMaterials?.facts?.length || start.coachMaterials.facts.length < 2) {
    throw new Error(`coachMaterials 應含至少 2 條 RAG 佐證，實際 ${start.coachMaterials?.facts?.length ?? 0}`);
  }
  console.log(`✓ coachMaterials RAG 佐證 ${start.coachMaterials.facts.length} 條`);

  const { res: getRes, data: boot } = await api(
    cookie,
    "GET",
    `/api/roleplay/sessions/${encodeURIComponent(start.sessionId)}`,
  );
  if (!getRes.ok) throw new Error(`GET bootstrap ${getRes.status}: ${boot.error}`);
  if (!boot.agentSpeaksFirst) {
    throw new Error("bootstrap 應含 agentSpeaksFirst: true（業代尚未發話）");
  }
  if (boot.turn !== 0) {
    throw new Error(`bootstrap turn 應為 0，實際 ${boot.turn}`);
  }
  console.log(`✓ GET bootstrap agentSpeaksFirst=true turn=0`);

  // 業代先發第一句（打招呼）
  const greeting = "您好，在看這台車有什麼問題嗎？我都可以為您說明喔！";
  const { res: turn1Res, data: turn1 } = await api(
    cookie,
    "POST",
    `/api/roleplay/sessions/${encodeURIComponent(start.sessionId)}/turn`,
    { message: greeting },
  );
  if (!turn1Res.ok) throw new Error(`第一輪 turn 失敗 ${turn1Res.status}: ${turn1.error}`);
  if (turn1.turn !== 1) throw new Error(`第一輪 turn 應為 1，實際 ${turn1.turn}`);
  if (!turn1.customerMessage?.trim()) {
    throw new Error("第一輪應回傳客戶開場訊息");
  }
  if (turn1.customerMessage !== start.customerMessage) {
    throw new Error("第一輪客戶訊息應為預先生成的開場台詞");
  }
  console.log(`✓ 第一輪 /turn：業代打招呼 → 客戶開場（${turn1.customerMessage.slice(0, 20)}…）`);

  const { res: boot2Res, data: boot2 } = await api(
    cookie,
    "GET",
    `/api/roleplay/sessions/${encodeURIComponent(start.sessionId)}`,
  );
  if (!boot2Res.ok) throw new Error(`GET bootstrap2 ${boot2Res.status}`);
  if (!boot2.coachMaterials?.facts?.length) {
    throw new Error("bootstrap 應含 coachMaterials.facts");
  }
  if (boot2.agentSpeaksFirst) {
    throw new Error("第一輪後 bootstrap 不應再 agentSpeaksFirst");
  }
  if (boot2.turn !== 1) throw new Error(`bootstrap2 turn 應為 1，實際 ${boot2.turn}`);
  const agentMsgs = boot2.messages?.filter((m) => m.role === "agent") ?? [];
  if (agentMsgs.length !== 1 || agentMsgs[0].content !== greeting) {
    throw new Error("後端應已記錄業代打招呼訊息");
  }
  console.log(`✓ bootstrap 更新：turn=1，業代訊息已寫入`);

  // 第二輪正常對話
  const { res: turn2Res, data: turn2 } = await api(
    cookie,
    "POST",
    `/api/roleplay/sessions/${encodeURIComponent(start.sessionId)}/turn`,
    { message: "我理解您在意油耗，我們可以用試算表具體比較。" },
  );
  if (!turn2Res.ok) throw new Error(`第二輪 turn 失敗 ${turn2Res.status}: ${turn2.error}`);
  if (turn2.turn !== 2) throw new Error(`第二輪 turn 應為 2，實際 ${turn2.turn}`);
  if (!turn2.customerMessage?.trim()) throw new Error("第二輪應有客戶回覆");
  if (turn2.customerMessage === start.customerMessage) {
    throw new Error("第二輪客戶訊息不應重複開場台詞");
  }
  console.log(`✓ 第二輪 /turn：正常 LLM 客戶回覆`);

  const { res: finRes, data: fin } = await api(
    cookie,
    "POST",
    `/api/roleplay/sessions/${encodeURIComponent(start.sessionId)}/finish`,
  );
  if (!finRes.ok) throw new Error(`finish 失敗 ${finRes.status}: ${fin.error}`);
  if (!fin.scoreResult?.score) throw new Error("無評分");
  console.log(`✓ 評分 ${fin.scoreResult.score} 分`);

  console.log("\n--- 業代先發全流程 OK ---");
}

main().catch((e) => {
  console.error("✗", e.message || e);
  process.exit(1);
});
