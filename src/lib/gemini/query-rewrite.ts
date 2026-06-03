import { createHash } from "node:crypto";
import { geminiGenerateText } from "@/lib/gemini/gemini-client";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { terms: string[]; expires: number }>();

function cacheKey(message: string, heroProduct: string): string {
  return createHash("sha256")
    .update(`${message.trim().toLowerCase()}::${heroProduct}`)
    .digest("hex");
}

function parseRewriteJson(text: string): string[] {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { terms?: unknown };
    if (!Array.isArray(parsed.terms)) return [];
    return parsed.terms
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * 將口語問句改寫成題庫 customer_question 風格的檢索短語。
 */
export async function rewriteQueryForSearch(
  message: string,
  heroProductDisplayName: string,
): Promise<string[]> {
  const key = cacheKey(message, heroProductDisplayName);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.terms;

  const prompt = `你是裕隆日產銷售知識庫檢索助手。將業代口語問題改寫成 3～5 個適合在題庫 customer_question 欄位做 LIKE 搜尋的短語。
本品：${heroProductDisplayName}
規則：
- 保留車款名、配備名、競品名等關鍵實體
- 可去掉「我覺得」「如何」「嗎」等口語，保留核心名詞
- 英中混寫可並列（如 XTRAIL / X-TRAIL）
- 只輸出 JSON：{"terms":["短語1","短語2"]}

問題：${message}`;

  const raw = await geminiGenerateText(prompt, {
    json: true,
    temperature: 0,
    maxOutputTokens: 256,
  });

  const terms = raw ? parseRewriteJson(raw) : [];
  cache.set(key, { terms, expires: Date.now() + CACHE_TTL_MS });
  return terms;
}

/** 測試用：清空快取 */
export function clearQueryRewriteCache(): void {
  cache.clear();
}
