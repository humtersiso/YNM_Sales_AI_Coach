import { GoogleAuth } from "google-auth-library";
import { getBigQueryClient, getBigQueryScriptDrillsConfig } from "@/lib/bq/script-drills-insert";
import {
  buildBriefReplyFromCitations,
  isUsableReply,
  isValidCitation,
  notInQuestionBankReply,
  summarizeToBrief,
  type ScriptCitation,
} from "@/lib/gemini/reply-format";

export type { ScriptCitation };

export type SalesChatResult = {
  reply: string;
  citations: ScriptCitation[];
  inQuestionBank: boolean;
};

function isMockChatEnabled() {
  const flag = (process.env.USE_MOCK_CHAT ?? "false").toLowerCase();
  return flag === "true" || flag === "1";
}

export type SalesChatConfig = {
  projectId: string;
  location: string;
  agentId: string;
};

export function getSalesChatConfig(): SalesChatConfig | null {
  const projectId = (
    process.env.GEMINI_DATA_ANALYTICS_PROJECT ??
    process.env.BIGQUERY_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    ""
  ).trim();
  const location = (process.env.GEMINI_DATA_ANALYTICS_LOCATION ?? "global").trim();
  const agentId = (process.env.GEMINI_DATA_ANALYTICS_AGENT_ID ?? "").trim();
  if (!projectId || !agentId) return null;
  return { projectId, location, agentId };
}

async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("無法取得 Google 存取權杖");
  return token.token;
}

function extractTextField(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t || null;
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.text === "string") return o.text.trim() || null;
    if (typeof o.markdown === "string") return o.markdown.trim() || null;
  }
  return null;
}

function pushTextFromMessage(obj: Record<string, unknown>, parts: string[]) {
  const system = obj.systemMessage as Record<string, unknown> | undefined;
  if (system) {
    if ("schema" in system || "data" in system || "chart" in system) return;
    const text = extractTextField(system.text);
    if (text) parts.push(text);
  }
  const agent = obj.agentMessage as Record<string, unknown> | undefined;
  if (agent) {
    const text = extractTextField(agent.text);
    if (text) parts.push(text);
  }
}

function extractReplyFromStreamBody(body: string): string {
  const parts: string[] = [];
  let acc = "";

  const tryAcc = () => {
    if (!acc.trim()) return;
    try {
      pushTextFromMessage(JSON.parse(acc) as Record<string, unknown>, parts);
      acc = "";
    } catch {
      // 繼續累積
    }
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line === "[{") {
      acc = "{";
      continue;
    }
    if (line === "}]") {
      acc += "}";
      tryAcc();
      continue;
    }
    if (line === ",") continue;

    if (line.startsWith("{")) {
      try {
        pushTextFromMessage(JSON.parse(line) as Record<string, unknown>, parts);
        continue;
      } catch {
        acc = line;
        tryAcc();
        continue;
      }
    }

    acc += line;
    tryAcc();
  }

  tryAcc();

  if (parts.length === 0) {
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      const jsonLine = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
      if (!jsonLine.startsWith("{")) continue;
      try {
        pushTextFromMessage(JSON.parse(jsonLine) as Record<string, unknown>, parts);
      } catch {
        // ignore
      }
    }
  }

  return parts.join(" ").trim();
}

/** Gemini Data Analytics API（Data Agent 查 BQ） */
async function tryGeminiReply(message: string): Promise<string | null> {
  const config = getSalesChatConfig();
  if (!config) return null;

  const { projectId, location, agentId } = config;
  const chatUrl = `https://geminidataanalytics.googleapis.com/v1beta/projects/${projectId}/locations/${location}:chat`;
  const token = await getAccessToken();

  const payload = {
    parent: `projects/${projectId}/locations/global`,
    messages: [{ userMessage: { text: message } }],
    data_agent_context: {
      data_agent: `projects/${projectId}/locations/${location}/dataAgents/${agentId}`,
    },
  };

  const res = await fetch(chatUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    console.error("Conversational Analytics API error", res.status, bodyText.slice(0, 500));
    return null;
  }

  return extractReplyFromStreamBody(bodyText) || null;
}

/** 自 BQ 話術表檢索引用（僅用於驗證題庫有無 + 引用標註，不作為對外聲稱的「備援」） */
export async function searchScriptRows(message: string, limit = 3): Promise<ScriptCitation[]> {
  const { projectId, dataset, tableId } = getBigQueryScriptDrillsConfig();
  if (!projectId) return [];

  const keywords = message
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5);

  if (keywords.length === 0) {
    return [];
  }

  const likeClause = keywords.map((_, i) => `LOWER(customer_question) LIKE LOWER(@kw${i})`).join(" OR ");
  const params: Record<string, string> = {};
  keywords.forEach((kw, i) => {
    params[`kw${i}`] = `%${kw}%`;
  });

  const client = getBigQueryClient();
  const sql = `
    SELECT customer_question, standard_script_idea AS standard_script
    FROM \`${projectId}.${dataset}.${tableId}\`
    WHERE (${likeClause})
      AND standard_script_idea IS NOT NULL
      AND TRIM(standard_script_idea) != ''
    LIMIT ${limit}
  `;
  const [rows] = await client.query({ query: sql, params });
  return (rows as { customer_question?: string; standard_script?: string }[])
    .map((r, i) => ({
      index: i + 1,
      question: r.customer_question?.trim() || "",
      script: r.standard_script?.trim() || "",
    }))
    .filter(isValidCitation)
    .map((c, i) => ({ ...c, index: i + 1 }));
}

function noMatchResult(): SalesChatResult {
  return {
    reply: notInQuestionBankReply(),
    citations: [],
    inQuestionBank: false,
  };
}

/**
 * 銷售助手問答：僅能依 BQ 題庫作答。
 * 1. 先查 BQ 確認題庫是否有相近話術
 * 2. 無則回覆「題庫無」
 * 3. 有則以 Gemini Data Analytics（Data Agent）為主產生回覆，並附引用
 */
export async function chatWithDataAgent(message: string): Promise<SalesChatResult> {
  if (isMockChatEnabled()) {
    return noMatchResult();
  }

  if (!getSalesChatConfig()) {
    console.error("GEMINI_DATA_ANALYTICS_AGENT_ID 未設定");
    return noMatchResult();
  }

  let citations: ScriptCitation[] = [];
  try {
    citations = await searchScriptRows(message, 3);
  } catch (e) {
    console.error("BigQuery script search failed", e);
    return noMatchResult();
  }

  if (citations.length === 0) {
    return noMatchResult();
  }

  try {
    const geminiReply = await tryGeminiReply(message);
    if (geminiReply && isUsableReply(geminiReply)) {
      const brief = summarizeToBrief(geminiReply);
      if (brief) {
        return { reply: brief, citations, inQuestionBank: true };
      }
    }
  } catch (e) {
    console.error("Gemini Data Analytics failed", e);
  }

  const briefFromBq = buildBriefReplyFromCitations(citations);
  if (briefFromBq) {
    return { reply: briefFromBq, citations, inQuestionBank: true };
  }

  return noMatchResult();
}
