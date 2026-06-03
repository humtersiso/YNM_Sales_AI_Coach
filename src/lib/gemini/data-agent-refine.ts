import { geminiGenerateText, getGeminiApiKey, getDataAgentConfig } from "@/lib/gemini/gemini-client";
import { buildDataAgentFormatPrompt } from "@/lib/gemini/sales-reply-directives";
import type { SalesQuestionProfile } from "@/lib/gemini/sales-question-profile";
import { classifySalesQuestion } from "@/lib/gemini/sales-question-profile";
import {
  cleanInlineMarkdown,
  formatMarkdownReplyToDisplay,
  isAgentMetaTitle,
  polishDataAgentReply,
  sanitizeDataAgentDisplay,
  type ScriptCitation,
} from "@/lib/gemini/reply-format";

export type FormattedAgentReply = {
  intro: string;
  bullets: string[];
};

/** @deprecated 請改用 FormattedAgentReply */
export type CondensedAgentReply = FormattedAgentReply;

const FORMAT_TEMPERATURE = 0.1;

function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

function stripAgentNoise(raw: string): string {
  return raw
    .replace(/^#+\s*insights\s*$/gim, "")
    .replace(/^insights\s*$/gim, "")
    .replace(/\[object Object\]/g, "")
    .trim();
}

function normalizeBulletLine(text: string): string {
  let s = cleanInlineMarkdown(text.replace(/^\*+\s*/, "").trim());
  const titled = s.match(/^([^：:]{2,16})[：:]\s*(.+)$/);
  if (titled) {
    s = `${titled[1].trim()}：${titled[2].trim()}`;
  }
  return s;
}

function normalizeFormattedPayload(obj: {
  intro?: string;
  bullets?: string[];
  text?: string;
}): FormattedAgentReply {
  if (Array.isArray(obj.bullets) && obj.bullets.length > 0) {
    let intro = cleanInlineMarkdown(String(obj.intro ?? ""));
    if (isAgentMetaTitle(intro)) intro = "";
    const bullets = obj.bullets
      .map((b) => normalizeBulletLine(String(b)))
      .filter((b) => b.length >= 6);
    if (bullets.length > 0) {
      const polished = polishDataAgentReply(intro, bullets);
      return sanitizeDataAgentDisplay(polished.intro, polished.bullets);
    }
  }

  const text = String(obj.text ?? obj.intro ?? "").trim();
  if (!text) return { intro: "", bullets: [] };
  return formatMarkdownReplyToDisplay(text);
}

function localFormatFallback(agentRaw: string): FormattedAgentReply {
  const parsed = formatMarkdownReplyToDisplay(agentRaw);
  const polished = polishDataAgentReply(parsed.intro, parsed.bullets);
  return sanitizeDataAgentDisplay(polished.intro, polished.bullets);
}

/**
 * 將 Data Agent 原文送 Gemini 整理成業代易讀、格式一致的列點。
 * 失敗時改走 deterministic markdown 解析（仍經 sanitize）。
 */
export async function formatDataAgentOutputForSales(
  agentRaw: string,
  userQuestion: string,
  citations: ScriptCitation[] = [],
  profile?: SalesQuestionProfile,
): Promise<FormattedAgentReply | null> {
  const resolvedProfile = profile ?? classifySalesQuestion(userQuestion);
  const trimmed = stripAgentNoise(agentRaw);
  if (!trimmed) return null;

  const canFormat = Boolean(getGeminiApiKey() || getDataAgentConfig());
  if (!canFormat) {
    return localFormatFallback(trimmed);
  }

  const prompt = buildDataAgentFormatPrompt(userQuestion, trimmed, citations, resolvedProfile);
  const raw = await geminiGenerateText(prompt, {
    json: true,
    maxOutputTokens: 8192,
    temperature: FORMAT_TEMPERATURE,
  });

  if (!raw) {
    return localFormatFallback(trimmed);
  }

  try {
    const obj = JSON.parse(extractJsonPayload(raw)) as {
      intro?: string;
      bullets?: string[];
      text?: string;
    };
    const normalized = normalizeFormattedPayload(obj);
    if (normalized.intro || normalized.bullets.length > 0) {
      return normalized;
    }
  } catch {
    // fall through
  }

  return localFormatFallback(trimmed);
}

/** @deprecated 請改用 formatDataAgentOutputForSales */
export async function condenseDataAgentOutput(
  agentRaw: string,
  userQuestion: string,
  citations: ScriptCitation[] = [],
  profile?: SalesQuestionProfile,
): Promise<FormattedAgentReply | null> {
  return formatDataAgentOutputForSales(agentRaw, userQuestion, citations, profile);
}
