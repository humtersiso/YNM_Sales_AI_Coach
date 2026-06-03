import { getDataAgentConfig, getGeminiApiKey } from "@/lib/gemini/gemini-client";

export type SalesChatMode = "agent" | "hybrid" | "bq-fast" | "data-agent" | "grounded";

/** 對外別名：function-calling = agent（FC 分流 + 固定 BQ + Gemini 摘要） */
export function resolveSalesChatMode(): SalesChatMode {
  const mode = (process.env.SALES_CHAT_MODE ?? "hybrid").trim().toLowerCase();
  if (mode === "bq-fast" || mode === "bq" || mode === "fast") return "bq-fast";
  if (mode === "data-agent" || mode === "gemini" || mode === "analytics") return "data-agent";
  if (mode === "hybrid") return "hybrid";
  if (mode === "grounded" || mode === "rag-grounded") return "grounded";
  if (
    mode === "agent" ||
    mode === "function-calling" ||
    mode === "fc-agent" ||
    mode === "fc" ||
    mode === "smart" ||
    mode === "default"
  ) {
    return "agent";
  }
  return "agent";
}

export function canUseGeminiSummarize(): boolean {
  return Boolean(getGeminiApiKey() || getDataAgentConfig());
}

export function canUseDataAgent(): boolean {
  return Boolean(getDataAgentConfig());
}

/** true：僅顯示 Data Agent 原文，不加工 */
export function isDataAgentRawMode(): boolean {
  const v = (process.env.SALES_DATA_AGENT_RAW ?? "false").trim().toLowerCase();
  return v === "true" || v === "1";
}

/**
 * true：Data Agent 原文再送 Gemini 整理成固定格式列點（預設開啟）。
 * 環境變數 SALES_DATA_AGENT_FORMAT 與 SALES_DATA_AGENT_CONDENSE 擇一設定即可。
 */
export function isDataAgentFormatMode(): boolean {
  if (isDataAgentRawMode()) return false;
  const formatFlag = (process.env.SALES_DATA_AGENT_FORMAT ?? "").trim().toLowerCase();
  if (formatFlag === "true" || formatFlag === "1") return true;
  if (formatFlag === "false" || formatFlag === "0") return false;
  const legacy = (process.env.SALES_DATA_AGENT_CONDENSE ?? "true").trim().toLowerCase();
  return legacy !== "false" && legacy !== "0";
}

/** @deprecated 請改用 isDataAgentFormatMode */
export function isDataAgentCondenseMode(): boolean {
  return isDataAgentFormatMode();
}
