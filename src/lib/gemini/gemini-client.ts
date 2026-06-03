import fs from "node:fs";
import path from "node:path";
import { GoogleAuth } from "google-auth-library";

/** 預設：Gemini API；Vertex 若 404 會依序嘗試 VERTEX_MODEL_FALLBACKS */
const PREFERRED_MODELS = ["gemini-3.1-flash-lite", "gemini-3.1-flash-lite-preview"] as const;

/** Vertex 備用模型（僅在 API key 不可用時；專案用 GEMINI_VERTEX_PROJECT，非 BI Engine 專案） */
const VERTEX_MODEL_FALLBACKS = [
  "gemini-2.0-flash-001",
  "gemini-2.0-flash",
  "gemini-1.5-flash-002",
  "gemini-1.5-flash",
] as const;

let cachedDotenvApiKey: string | null | undefined;
let envKeyMismatchWarned = false;

/** 讀取 web/.env（Next 不會覆寫已存在的 process.env，避免系統舊 key 蓋過 .env） */
function readGeminiApiKeyFromEnvFiles(): string | null {
  const root = process.cwd();
  for (const name of [".env.local", ".env"]) {
    const filePath = path.join(root, name);
    if (!fs.existsSync(filePath)) continue;
    try {
      for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i <= 0) continue;
        if (t.slice(0, i).trim() === "GEMINI_API_KEY") {
          const v = t.slice(i + 1).trim();
          if (v) return v;
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

export function getGeminiApiKey(): string | null {
  if ((process.env.GEMINI_USE_VERTEX_ONLY ?? "").trim().toLowerCase() === "true") return null;

  if (cachedDotenvApiKey === undefined) {
    cachedDotenvApiKey = readGeminiApiKeyFromEnvFiles();
  }

  const fromFile = cachedDotenvApiKey;
  const fromEnv = (process.env.GEMINI_API_KEY ?? "").trim();

  if (fromFile && fromEnv && fromFile !== fromEnv) {
    if (!envKeyMismatchWarned) {
      envKeyMismatchWarned = true;
      console.warn(
        "[gemini] 系統 GEMINI_API_KEY 與 web/.env 不一致，已改用 .env（建議刪除 Windows 使用者環境變數裡過期的 GEMINI_API_KEY）",
      );
    }
    process.env.GEMINI_API_KEY = fromFile;
    return fromFile;
  }

  return fromFile || fromEnv || null;
}

function getApiModelCandidates(): string[] {
  const preferred = getPreferredGeminiModel();
  return [...new Set([preferred, ...PREFERRED_MODELS])];
}

function keyFingerprint(key: string): string {
  return key.length >= 8 ? `…${key.slice(-4)}` : "…";
}

export function getPreferredGeminiModel(): string {
  return (process.env.GEMINI_MODEL ?? PREFERRED_MODELS[0]).trim();
}

/** Vertex AI 專案（勿與 BI Engine 專案 653828324568 混用） */
export function getVertexProjectId(): string {
  return (
    process.env.GEMINI_VERTEX_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.BIGQUERY_PROJECT_ID ??
    "gen-lang-client-0927009312"
  ).trim();
}

function getVertexModelCandidates(): string[] {
  const preferred = getPreferredGeminiModel();
  const extra = (process.env.GEMINI_VERTEX_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([preferred, ...extra, ...VERTEX_MODEL_FALLBACKS])];
}

type GenerateContentPart = {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
};

type GenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<GenerateContentPart> };
  }>;
};

function parseGenerateResponse(json: GenerateContentResponse): string | null {
  return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

export type GeminiFunctionCall = {
  name: string;
  args: Record<string, unknown>;
};

export type GeminiGenerateWithToolsResult = {
  text: string | null;
  functionCall: GeminiFunctionCall | null;
};

function parseParts(parts: GenerateContentPart[] | undefined): GeminiGenerateWithToolsResult {
  if (!parts?.length) return { text: null, functionCall: null };
  let text: string | null = null;
  let functionCall: GeminiFunctionCall | null = null;
  for (const p of parts) {
    if (p.text?.trim()) text = p.text.trim();
    if (p.functionCall?.name) {
      functionCall = {
        name: p.functionCall.name,
        args: (p.functionCall.args as Record<string, unknown>) ?? {},
      };
    }
  }
  return { text, functionCall };
}

/** 解析 streamGenerateContent SSE（累加 text delta） */
export function parseGeminiStreamLine(
  line: string,
  accumulated: string,
): { text: string; delta: string } {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return { text: accumulated, delta: "" };
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return { text: accumulated, delta: "" };
  try {
    const json = JSON.parse(payload) as GenerateContentResponse;
    const delta = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!delta) return { text: accumulated, delta: "" };
    return { text: accumulated + delta, delta };
  } catch {
    return { text: accumulated, delta: "" };
  }
}

async function vertexGenerateWithModel(
  projectId: string,
  location: string,
  model: string,
  token: string,
  prompt: string,
  options?: GeminiGenerateOptions,
): Promise<string | null> {
  const temperature = options?.temperature ?? 0.2;
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: options?.maxOutputTokens ?? 900,
        ...(options?.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    const retryable = res.status === 404 || /not found|does not have access/i.test(err);
    if (retryable) {
      console.warn(`Vertex model unavailable: ${model} (${res.status})`);
    } else {
      console.error("Vertex generateContent failed", res.status, model, err.slice(0, 200));
    }
    return null;
  }

  const json = (await res.json()) as GenerateContentResponse;
  return parseGenerateResponse(json);
}

async function vertexGenerateText(
  prompt: string,
  options?: GeminiGenerateOptions,
): Promise<string | null> {
  const projectId = getVertexProjectId();
  if (!projectId) return null;

  const location = (process.env.GEMINI_VERTEX_LOCATION ?? "us-central1").trim();
  const token = await getAccessToken();

  for (const model of getVertexModelCandidates()) {
    const text = await vertexGenerateWithModel(projectId, location, model, token, prompt, options);
    if (text) {
      if (model !== getPreferredGeminiModel()) {
        console.info(`[gemini] Vertex 使用備用模型: ${model}`);
      }
      return text;
    }
  }
  return null;
}

async function geminiApiGenerateText(
  key: string,
  model: string,
  prompt: string,
  options?: GeminiGenerateOptions,
): Promise<string | null> {
  const temperature = options?.temperature ?? 0.2;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: options?.maxOutputTokens ?? 900,
      ...(options?.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (res.ok) {
    const json = (await res.json()) as GenerateContentResponse;
    return parseGenerateResponse(json);
  }

  const err = await res.text();
  const retryableModel = res.status === 404 || /not found/i.test(err);
  if (retryableModel) {
    console.warn(`[gemini] API 模型不可用: ${model} (${res.status})`);
    return null;
  }

  console.error(
    `[gemini] API generateContent failed model=${model} key=${keyFingerprint(key)}`,
    res.status,
    err.slice(0, 280),
  );
  return null;
}

/** Gemini API generateContent（GEMINI_API_KEY 或 Vertex ADC） */
export type GeminiGenerateOptions = {
  json?: boolean;
  maxOutputTokens?: number;
  /** 愈低愈穩定；整理 Data Agent 原文建議 0.1 */
  temperature?: number;
};

export async function geminiGenerateText(
  prompt: string,
  options?: GeminiGenerateOptions,
): Promise<string | null> {
  const key = getGeminiApiKey();

  if (key) {
    for (const model of getApiModelCandidates()) {
      let text = await geminiApiGenerateText(key, model, prompt, options);
      if (text) {
        if (model !== getPreferredGeminiModel()) {
          console.info(`[gemini] API 使用備用模型: ${model}`);
        }
        return text;
      }
      if (options?.json) {
        text = await geminiApiGenerateText(key, model, prompt, { ...options, json: false });
        if (text) return text;
      }
    }
  }

  let text = await vertexGenerateText(prompt, options);
  if (!text && options?.json) {
    text = await vertexGenerateText(prompt, { ...options, json: false });
  }
  return text;
}

const SALES_ROUTE_TOOLS = {
  tools: [
    {
      functionDeclarations: [
        {
          name: "plan_knowledge_search",
          description:
            "規劃如何查詢裕隆日產銷售知識庫（BigQuery）。用於車型、話術、競品、媒體、配備等業務問題。",
          parameters: {
            type: "object",
            properties: {
              intent: {
                type: "string",
                enum: ["knowledge", "off_topic"],
                description: "off_topic 僅用於與汽車銷售無關的問題（如天氣、閒聊）",
              },
              material_category: {
                type: "string",
                enum: ["sales_script", "competitor_compare", "product_info", "general"],
              },
              file_hints: {
                type: "array",
                items: { type: "string" },
                description: "檔名片段，如 TERRITORY_YT、對戰、媒體",
              },
              limit: { type: "integer", description: "回傳筆數上限 6-12" },
            },
            required: ["intent"],
          },
        },
      ],
    },
  ],
  toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["plan_knowledge_search"] } },
};

/** Gemini Function Calling：意圖分流（單輪，低延遲） */
export async function geminiPlanKnowledgeSearch(
  message: string,
  scopeHint: string,
): Promise<GeminiGenerateWithToolsResult | null> {
  const key = getGeminiApiKey();
  const model = getPreferredGeminiModel();
  const prompt = `你是銷售知識庫路由助手。根據使用者問題，呼叫 plan_knowledge_search 決定如何查 BigQuery。
使用者選擇的範圍：${scopeHint}
問題：${message}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    ...SALES_ROUTE_TOOLS,
    generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
  };

  if (key) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    if (res.ok) {
      const json = (await res.json()) as GenerateContentResponse;
      return parseParts(json.candidates?.[0]?.content?.parts);
    }
  }

  const projectId = (
    process.env.GEMINI_DATA_ANALYTICS_PROJECT ??
    process.env.BIGQUERY_PROJECT_ID ??
    ""
  ).trim();
  if (!projectId) return null;
  const location = (process.env.GEMINI_VERTEX_LOCATION ?? "us-central1").trim();
  const token = await getAccessToken();
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], ...SALES_ROUTE_TOOLS, generationConfig: body.generationConfig }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as GenerateContentResponse;
  return parseParts(json.candidates?.[0]?.content?.parts);
}

/** 串流產生純文字（用於 intro 打字效果） */
export async function* geminiStreamText(
  prompt: string,
  options?: { maxOutputTokens?: number },
): AsyncGenerator<string> {
  const key = getGeminiApiKey();
  const model = getPreferredGeminiModel();
  const genConfig = { temperature: 0.2, maxOutputTokens: options?.maxOutputTokens ?? 320 };

  const url = key
    ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`
    : null;

  let res: Response | null = null;
  if (url) {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: genConfig }),
    });
  } else {
    const projectId = (
      process.env.GEMINI_DATA_ANALYTICS_PROJECT ??
      process.env.BIGQUERY_PROJECT_ID ??
      ""
    ).trim();
    if (!projectId) return;
    const location = (process.env.GEMINI_VERTEX_LOCATION ?? "us-central1").trim();
    const token = await getAccessToken();
    const vertexUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:streamGenerateContent`;
    res = await fetch(vertexUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: genConfig,
      }),
    });
  }

  if (!res?.ok || !res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const { text, delta } = parseGeminiStreamLine(line, accumulated);
      accumulated = text;
      if (delta) yield delta;
    }
  }
  if (buffer.trim()) {
    const { delta } = parseGeminiStreamLine(buffer, accumulated);
    if (delta) yield delta;
  }
}

export type DataAgentConfig = {
  projectId: string;
  location: string;
  agentId: string;
};

/** Conversational Analytics API ThinkingMode（見 :chat 文件） */
export type DataAgentThinkingMode = "FAST" | "THINKING";

/** `GEMINI_DATA_AGENT_THINKING_MODE`：FAST（較快）或 THINKING；未設則由 API 預設 */
export function getDataAgentThinkingMode(): DataAgentThinkingMode | null {
  const raw = (process.env.GEMINI_DATA_AGENT_THINKING_MODE ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "FAST") return "FAST";
  if (raw === "THINKING") return "THINKING";
  console.warn(`[dataAgent] 未知的 GEMINI_DATA_AGENT_THINKING_MODE="${raw}"，已忽略`);
  return null;
}

export function getDataAgentConfig(): DataAgentConfig | null {
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

/** ADC 存取權杖（BigQuery、Discovery Engine、Vertex 共用） */
export async function getGcpAccessToken(): Promise<string> {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("無法取得 Google 存取權杖");
  return token.token;
}

async function getAccessToken(): Promise<string> {
  return getGcpAccessToken();
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

function collectFinalResponses(obj: Record<string, unknown>, finals: string[], legacy: string[]) {
  const system = obj.systemMessage as Record<string, unknown> | undefined;
  if (system) {
    const textObj = system.text as Record<string, unknown> | undefined;
    if (textObj && Array.isArray(textObj.parts)) {
      const textType = String(textObj.textType ?? "");
      const joined = textObj.parts.map((p) => String(p ?? "").trim()).filter(Boolean).join("\n");
      if (!joined) return;
      if (textType === "FINAL_RESPONSE") {
        finals.push(joined);
        return;
      }
      if (textType === "THOUGHT" || textType === "FOLLOWUP_QUESTIONS") return;
    }
    if ("data" in system && !textObj) return;
    const text = extractTextField(system.text);
    if (text) legacy.push(text);
  }
  const agent = obj.agentMessage as Record<string, unknown> | undefined;
  if (agent) {
    const text = extractTextField(agent.text);
    if (text) legacy.push(text);
  }
}

function extractFromJsonArray(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed.startsWith("[")) return null;
  try {
    const arr = JSON.parse(trimmed) as Record<string, unknown>[];
    const finals: string[] = [];
    const legacy: string[] = [];
    for (const obj of arr) {
      if (obj && typeof obj === "object") collectFinalResponses(obj, finals, legacy);
    }
    if (finals.length > 0) return finals[finals.length - 1].trim();
    if (legacy.length > 0) return legacy.join("\n").trim();
    return null;
  } catch {
    return null;
  }
}

function extractReplyFromStreamBody(body: string): string {
  const fromArray = extractFromJsonArray(body);
  if (fromArray) return fromArray;

  const finals: string[] = [];
  const legacy: string[] = [];
  let acc = "";

  const tryAcc = () => {
    if (!acc.trim()) return;
    try {
      collectFinalResponses(JSON.parse(acc) as Record<string, unknown>, finals, legacy);
      acc = "";
    } catch {
      // continue
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
        collectFinalResponses(JSON.parse(line) as Record<string, unknown>, finals, legacy);
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

  if (finals.length > 0) return finals[finals.length - 1].trim();
  return legacy.join("\n").trim();
}

/** Gemini Data Analytics Data Agent chat */
export async function dataAgentChat(userMessage: string): Promise<string | null> {
  const config = getDataAgentConfig();
  if (!config) return null;

  const { projectId, location, agentId } = config;
  const chatUrl = `https://geminidataanalytics.googleapis.com/v1beta/projects/${projectId}/locations/${location}:chat`;
  const token = await getAccessToken();

  const payload: Record<string, unknown> = {
    parent: `projects/${projectId}/locations/global`,
    messages: [{ userMessage: { text: userMessage } }],
    data_agent_context: {
      data_agent: `projects/${projectId}/locations/${location}/dataAgents/${agentId}`,
    },
  };
  const thinkingMode = getDataAgentThinkingMode();
  if (thinkingMode) payload.thinkingMode = thinkingMode;

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
    console.error("Data Agent chat failed", res.status, bodyText.slice(0, 400));
    return null;
  }

  return extractReplyFromStreamBody(bodyText) || null;
}
