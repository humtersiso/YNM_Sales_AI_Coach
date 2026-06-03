/** 回應速度相關開關（見 deploy/cloudrun-test.env.yaml） */

function envFlag(name: string, defaultValue = false): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "true" || raw === "1";
}

function envRaw(name: string): string {
  return (process.env[name] ?? "").trim().toLowerCase();
}

function isUnlimitedToken(raw: string): boolean {
  return raw === "all" || raw === "unlimited" || raw === "full" || raw === "0";
}

/** 總開關：啟用一組加速策略（略過冗餘 Data Agent、精簡檢索） */
export function isSalesChatFastMode(): boolean {
  return envFlag("SALES_CHAT_FAST", false);
}

/** 固定 BQ 已命中 citations 時，略過 Data Agent（通常可省 5–15 秒） */
export function skipDataAgentWhenCitationsFound(): boolean {
  if (envFlag("SALES_SKIP_DATA_AGENT_ON_HIT", false)) return true;
  return isSalesChatFastMode();
}

/**
 * 是否禁止 Data Agent fallback。
 * FAST 只影響檢索池／摘要長度，不再連帶禁用 Data Agent（需明確設 SALES_NEVER_DATA_AGENT）。
 */
export function neverCallDataAgent(): boolean {
  if (envFlag("SALES_ALLOW_DATA_AGENT", false)) return false;
  return envFlag("SALES_NEVER_DATA_AGENT", false);
}

/** FAST 模式 Gemini 摘要：較少摘錄、較短 context */
export function summarizeContextCharLimit(): number {
  const n = Number(process.env.SALES_SUMMARIZE_CONTEXT_CHARS ?? "");
  if (!Number.isNaN(n) && n > 0) return Math.min(n, 2000);
  return isSalesChatFastMode() ? 720 : 1200;
}

export function summarizeMaxOutputTokens(): number {
  const n = Number(process.env.SALES_SUMMARIZE_MAX_OUTPUT_TOKENS ?? "");
  if (!Number.isNaN(n) && n > 0) return Math.min(n, 2048);
  return isSalesChatFastMode() ? 1024 : 1536;
}

/** RAG Grounding 生成上限（串流／非串流共用；防禦話術需較長輸出） */
export function groundingMaxOutputTokens(): number {
  const n = Number(process.env.RAG_GROUNDING_MAX_OUTPUT_TOKENS ?? "");
  if (!Number.isNaN(n) && n > 0) return Math.min(n, 2048);
  return isSalesChatFastMode() ? 1024 : 1536;
}

/** 語意檢索（需 embedding 表；fast 模式預設關閉） */
export function useSemanticSearch(): boolean {
  if (isSalesChatFastMode()) {
    return envFlag("SALES_KNOWLEDGE_SEMANTIC_SEARCH", false);
  }
  return envFlag("SALES_KNOWLEDGE_SEMANTIC_SEARCH", false);
}

/** 查詢改寫（Gemini）；fast 模式僅在完全無結果時觸發 */
export function useQueryRewrite(): boolean {
  return !envFlag("SALES_DISABLE_QUERY_REWRITE", false);
}

/**
 * BQ 召回不設 LIMIT（仍受 SALES_RETRIEVAL_MAX_POOL 安全上限，預設 500）。
 * 設 SALES_RETRIEVAL_POOL_SIZE=all
 */
export function isRetrievalPoolUnlimited(): boolean {
  return isUnlimitedToken(envRaw("SALES_RETRIEVAL_POOL_SIZE"));
}

/** 安全上限：POOL_SIZE=all 時 SQL LIMIT 用此值；避免單次查詢爆量 */
export function retrievalRecallMaxPool(): number {
  const n = Number(process.env.SALES_RETRIEVAL_MAX_POOL ?? "");
  if (!Number.isNaN(n) && n > 0) return Math.min(n, 2000);
  return 500;
}

/**
 * BQ 單次召回筆數上限。
 * - `all` / `unlimited` / `0` → null（改用 retrievalRecallMaxPool()）
 * - 正整數 → 該上限（硬 cap 2000）
 */
export function retrievalRecallPoolSize(): number | null {
  const raw = envRaw("SALES_RETRIEVAL_POOL_SIZE");
  if (isUnlimitedToken(raw)) return null;
  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0) return Math.min(n, 2000);
  return isSalesChatFastMode() ? 12 : 24;
}

/** 實際傳入 BQ SQL 的 LIMIT */
export function sqlRecallLimit(explicit?: number | null): number {
  if (explicit != null && explicit > 0) return Math.min(explicit, 2000);
  const pool = retrievalRecallPoolSize();
  if (pool == null) return retrievalRecallMaxPool();
  return pool;
}

/**
 * 送進 rerank / citations 的筆數上限。
 * - `all` → null（rerank 後全留，仍受 SUMMARIZE 摘錄上限）
 */
export function isRetrievalTopKUnlimited(): boolean {
  return isUnlimitedToken(envRaw("SALES_RETRIEVAL_TOP_K"));
}

/** 回傳給 LLM 的 citation 上限；null 表示 rerank 後全送（見 summarizeMaxCitations） */
export function retrievalResultLimit(defaultLimit: number): number | null {
  if (isRetrievalTopKUnlimited()) return null;
  const n = Number(process.env.SALES_RETRIEVAL_TOP_K ?? "");
  if (!Number.isNaN(n) && n > 0) return Math.min(n, 200);
  if (isSalesChatFastMode()) return Math.min(defaultLimit, 8);
  return defaultLimit;
}

/** Gemini 摘要時最多幾段摘錄（每段最多 1200 字） */
export function summarizeMaxCitations(): number {
  if (isRetrievalTopKUnlimited()) {
    const n = Number(process.env.SALES_SUMMARIZE_MAX_CITATIONS ?? "");
    if (!Number.isNaN(n) && n > 0) return Math.min(n, 200);
    return retrievalRecallMaxPool();
  }
  const n = Number(process.env.SALES_SUMMARIZE_MAX_CITATIONS ?? "");
  if (!Number.isNaN(n) && n > 0) return Math.min(n, 50);
  return 8;
}
