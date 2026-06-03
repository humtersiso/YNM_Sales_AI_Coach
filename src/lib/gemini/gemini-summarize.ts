import type { ScriptCitation } from "@/lib/gemini/reply-format";
import {
  buildCitationMarkerHardLimit,
  buildCitationMarkerRules,
  buildKnowledgeXmlContext,
  type CitationCard,
} from "@/lib/gemini/citation-card";
import { prepareCitationCards } from "@/lib/gemini/citation-utils";
import {
  buildBulletReplyFromText,
  isUsableReply,
  normalizeReplyLine,
  polishSalesReply,
  sanitizeReplyCitationMarkers,
} from "@/lib/gemini/reply-format";
import {
  SALES_REPLY_LENGTH_HINT,
  SALES_REPLY_MAX_BULLETS,
} from "@/lib/gemini/sales-reply-config";
import {
  geminiGenerateText,
  geminiStreamText,
  getGeminiApiKey,
  getDataAgentConfig,
} from "@/lib/gemini/gemini-client";
import {
  buildCompetitorDefenseRules,
  buildSummarizeCategoryRules,
} from "@/lib/gemini/sales-reply-directives";
import {
  isSalesChatFastMode,
  summarizeContextCharLimit,
  summarizeMaxOutputTokens,
} from "@/lib/gemini/sales-chat-speed";
import {
  classifySalesQuestion,
  type SalesQuestionProfile,
} from "@/lib/gemini/sales-question-profile";

export type SummarizedReply = {
  intro: string;
  bullets: string[];
  source: "gemini" | "parse-fallback";
};

function looksLikeTableDump(text: string): boolean {
  const t = text.trim();
  if (/Here'?s the query result/i.test(t)) return true;
  if (/standard_script_idea/i.test(t) && /customer_question/i.test(t)) return true;
  if ((t.match(/\|/g) ?? []).length >= 6) return true;
  return false;
}

function buildContextBlock(citations: ScriptCitation[]): {
  xml: string;
  maxDocId: number;
  markerRules: string;
} {
  const charLimit = summarizeContextCharLimit();
  const prep = prepareCitationCards(citations);
  const cards: CitationCard[] = prep.cards.map((c) => ({
    ...c,
    excerpt: c.excerpt.slice(0, charLimit),
  }));
  const markerRules = buildCitationMarkerRules(cards.length);
  const markerHardLimit = buildCitationMarkerHardLimit(cards.length);
  return {
    xml: buildKnowledgeXmlContext(cards, charLimit),
    maxDocId: cards.length,
    markerRules,
    markerHardLimit,
  };
}

function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

function parseJsonReply(raw: string): SummarizedReply | null {
  try {
    const obj = JSON.parse(extractJsonPayload(raw)) as { intro?: string; bullets?: string[] };
    const intro = normalizeReplyLine(String(obj.intro ?? ""));
    const bullets = (obj.bullets ?? [])
      .map((b) => normalizeReplyLine(String(b)))
      .filter((b) => b.length >= 6)
      .slice(0, SALES_REPLY_MAX_BULLETS);
    if (bullets.length === 0) return null;
    const polished = polishSalesReply(intro, bullets);
    if (polished.bullets.length === 0) return null;
    return { intro: polished.intro, bullets: polished.bullets, source: "gemini" };
  } catch {
    return null;
  }
}

/**
 * 以 Gemini 將 BQ 檢索結果摘要成業代用短列點（僅用摘錄，不讓模型自行查表）
 */
export async function summarizeCitationsWithGemini(
  userQuestion: string,
  citations: ScriptCitation[],
  profile?: SalesQuestionProfile,
): Promise<SummarizedReply | null> {
  const canGenerate = Boolean(getGeminiApiKey() || getDataAgentConfig());
  if (!canGenerate || citations.length === 0) return null;

  const resolvedProfile = profile ?? classifySalesQuestion(userQuestion);
  const categoryRules = buildSummarizeCategoryRules(resolvedProfile);
  const competitorDefense = buildCompetitorDefenseRules(resolvedProfile, userQuestion);
  const context = buildContextBlock(citations);
  const prompt = `你是裕隆日產汽車銷售培訓助理。只能根據下方 <Knowledge_Base> 回答，不可編造。

${context.markerHardLimit}

${context.markerRules}
${competitorDefense ? `\n${competitorDefense}\n` : ""}

業務問題：${userQuestion}
問題分類：${resolvedProfile.category}

${categoryRules}

<Knowledge_Base>
${context.xml}
</Knowledge_Base>

輸出 JSON（勿加 markdown 程式碼區塊）：
{
  "intro": "直接回答（引用處加 [id]；禁止「這份摘要」「以下整理」）",
  "bullets": ["重點1[1]", "重點2[2]", "..."]
}

規則：
- intro 與 bullets 都直接切入問題，禁止 meta 套話（如「這份彙整涵蓋了」）
- ${SALES_REPLY_LENGTH_HINT}
- 以建議/可強調/重點/可回覆開頭，每條只寫一個重點（數據、差異或連結擇要保留）
- 使用繁體中文；不要表格、不要 SQL、不要英文標題、不要 ### 小標
- 若為競品負評或影片，列出差異點並保留關鍵頻道/連結（可精簡 URL）
- 忽略版權宣告、Confidential、頁碼等雜訊
- 若摘錄不足以回答，bullets 只列摘錄中確定有的內容
- 若業務問題問馬力、扭力、油耗、尺寸等規格，摘錄中有具體數字必須寫入 intro 或 bullets；摘錄僅有形容詞而無數字時，intro 須說明「引用段落未載明具體數值」
- 若問持有成本、用車成本、長期成本或「詳細數字」：必須逐項列出摘錄中的金額（元、萬元）、里程前提（如 8 萬公里、16 萬公里）、X-TRAIL 與競品差額；禁止只寫「項目架構」「未載明數據」而摘錄中其實有數字
- 若業務問題提及摘錄中未出現的車款、代號或名詞（例如 UFO、非題庫車型），intro 必須明確說明「知識庫無此名詞資料」，不可改介紹其他車款來代替回答
- 禁止答非所問：不可忽略問題主體，僅介紹摘錄裡與另一車款有關的內容

${context.markerHardLimit}
${context.markerRules}`;

  const raw = await geminiGenerateText(prompt, {
    json: true,
    maxOutputTokens: summarizeMaxOutputTokens(),
    temperature: isSalesChatFastMode() ? 0.15 : 0.3,
  });
  if (!raw) return null;

  const parsed = parseJsonReply(raw);
  if (parsed) {
    const clean = sanitizeReplyCitationMarkers(parsed.intro, parsed.bullets, context.maxDocId);
    return { intro: clean.intro, bullets: clean.bullets, source: parsed.source };
  }

  if (looksLikeTableDump(raw) || !isUsableReply(raw)) return null;
  if (raw.includes('"intro"') || raw.includes('"bullets"')) return null;

  const fallback = buildBulletReplyFromText(raw);
  if (fallback.bullets.length === 0) return null;
  const clean = sanitizeReplyCitationMarkers(fallback.intro, fallback.bullets, context.maxDocId);
  return {
    intro: clean.intro,
    bullets: clean.bullets,
    source: "parse-fallback",
  };
}

/** 串流產生一句直接結論（供前端先顯示，降低體感延遲） */
export async function* streamIntroFromCitations(
  userQuestion: string,
  citations: ScriptCitation[],
  profile?: SalesQuestionProfile,
): AsyncGenerator<string> {
  const canGenerate = Boolean(getGeminiApiKey() || getDataAgentConfig());
  if (!canGenerate || citations.length === 0) return;

  const resolvedProfile = profile ?? classifySalesQuestion(userQuestion);
  const hero = resolvedProfile.heroProduct.displayName;
  const rival = resolvedProfile.mentionedCompetitor;
  const introHint =
    resolvedProfile.category === "competitor"
      ? `小結須點出 ${rival ?? "競品"} vs ${hero} 的關鍵差異。`
      : resolvedProfile.category === "sales_qa"
        ? "小結以「可這樣回客戶…」或直接回應方向。"
        : `小結以 ${hero} 配備或規格結論為主。`;

  const top = citations
    .slice(0, 3)
    .map((c) => `${c.question}: ${c.script.slice(0, 280)}`)
    .join("\n");

  const prompt = `你是裕隆日產汽車銷售培訓助理。根據摘錄用繁體中文寫「一句話直接結論」回答問題（60～96字）。
禁止「這份摘要」「以下整理」。不要列點、不要 markdown。
${introHint}

問題：${userQuestion}

摘錄：
${top}`;

  for await (const delta of geminiStreamText(prompt, { maxOutputTokens: 180 })) {
    yield delta;
  }
}

export { looksLikeTableDump };
