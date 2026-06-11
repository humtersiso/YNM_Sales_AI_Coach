/**
 * 高分問答集 · 逐題 RAG 核對 + Gemini 口語詳解
 */
import { geminiGenerateText } from "../../../src/lib/gemini/gemini-client";
import {
  filterFactsForSession,
  hasConcreteNumbers,
  normalizeCompetitorToken,
} from "../../../src/lib/roleplay/engine/correction-guide";
import { isRawRagDump } from "../../../src/lib/roleplay/engine/correction-builder";
import { isValidRagFact } from "../../../src/lib/roleplay/rag-context";
import type { CompetitorChapter, QA, RagChapterInput } from "./roleplay-high-score-qa-core";
import { B } from "./roleplay-high-score-qa-core";
import { classifySnippetTopic, type QaTopic } from "./roleplay-high-score-qa-topics";
import { cleanFactExcerpt } from "./roleplay-high-score-qa-rag-text";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function topicFromQa(qa: QA): QaTopic {
  const tagTopic = qa.topic ?? "";
  const map: Record<string, QaTopic> = {
    "油耗／持有成本": "fuel",
    "保養／耐用": "maintenance",
    "隔音／質感": "sound",
    "盲操／操作": "blind",
    "空間／舒適": "space",
    "價格／方案": "price",
    "安全／輔助": "safety",
    "配備／科技": "equip",
    "銷售策略": "strategy",
    "推進成交": "advance",
    "綜合比較": "general",
  };
  if (map[tagTopic]) return map[tagTopic]!;
  if (/油耗|WLTC|試算/i.test(qa.q)) return "fuel";
  if (/保養|回廠|耐用|積碳/i.test(qa.q)) return "maintenance";
  if (/隔音|玻璃|NVH/i.test(qa.q)) return "sound";
  if (/旋鈕|盲|操作|螢幕/i.test(qa.q)) return "blind";
  if (/空間|後座|行李/i.test(qa.q)) return "space";
  if (/促銷|價格|方案|預算/i.test(qa.q)) return "price";
  if (/ProPILOT|安全|輔助/i.test(qa.q)) return "safety";
  if (/配備|科技/i.test(qa.q)) return "equip";
  if (/策略|LINE|延後/i.test(qa.q)) return "strategy";
  if (/收尾|家人|成交/i.test(qa.q)) return "advance";
  return "general";
}

function scoreFactsForTopic(text: string, topic: QaTopic): number {
  const t = classifySnippetTopic(text);
  if (t === topic) return 3;
  if (topic === "general" && t !== "general") return 1;
  if (topic === "fuel" && /油耗|WLTC|試算|油資/i.test(text)) return 2;
  if (topic === "maintenance" && /保養|回廠|引擎|積碳/i.test(text)) return 2;
  if (topic === "sound" && /隔音|玻璃|分貝/i.test(text)) return 2;
  if (topic === "blind" && /旋鈕|按鍵|盲/i.test(text)) return 2;
  if (topic === "space" && /空間|後座|行李/i.test(text)) return 2;
  if (topic === "price" && /價格|優惠|促銷|萬/i.test(text)) return 2;
  if (topic === "safety" && /ProPILOT|輔助|安全/i.test(text)) return 2;
  if (topic === "equip" && /配備|科技/i.test(text)) return 2;
  return 0;
}

function formatFactsForPrompt(
  facts: { label: string; value: string }[],
  competitor: string,
  topic: QaTopic,
  customerAsk: string,
): string {
  const filtered = filterFactsForSession(facts, competitor, customerAsk);
  const scored = filtered
    .filter((f) => isValidRagFact({ label: f.label, value: cleanFactExcerpt(f.value) || "—" }))
    .map((f) => {
      const body = cleanFactExcerpt(f.value).slice(0, 480);
      return {
        label: f.label,
        body,
        score: scoreFactsForTopic(`${f.label} ${body}`, topic),
      };
    })
    .filter((f) => f.body.length >= 8 && !isRawRagDump(f.body))
    .sort((a, b) => b.score - a.score);

  const picked = scored.slice(0, 8);
  if (picked.length === 0) {
    return "（本題相關教材較少，僅能依已檢索片段回答，勿捏造數字）";
  }
  return picked
    .map((f, i) => `${i + 1}. [${f.label}]\n${f.body}`)
    .join("\n\n");
}

type EnrichPayload = {
  full?: string;
  blankPhrases?: string[];
  ragUsed?: string[];
};

function parseEnrichJson(raw: string): EnrichPayload | null {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]!) as EnrichPayload;
  } catch {
    return null;
  }
}

function buildBlankFromFull(full: string, phrases: string[]): string {
  let blank = full.replace(/\n/g, "<br/>");
  const used = new Set<string>();
  for (const phrase of phrases) {
    const p = phrase.trim();
    if (p.length < 4 || used.has(p)) continue;
    if (!full.includes(p)) continue;
    const safe = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    blank = blank.replace(new RegExp(safe), B(p));
    used.add(p);
  }
  return blank;
}

function fallbackEnrich(qa: QA, factsText: string): { full: string; blank: string } {
  const lines = factsText
    .split(/\n+/)
    .map((l) => l.replace(/^\d+\.\s*\[[^\]]+\]\s*/, "").trim())
    .filter((l) => l.length >= 12 && !isRawRagDump(l))
    .slice(0, 3);
  const empathy = /策略|情境/.test(qa.q)
    ? "理解您希望當場就聽到具體說明，這很合理。"
    : "理解您會這樣比較，很多客戶也會先確認這一點。";
  const factPart =
    lines.length > 0
      ? `依本場教材：${lines.join("；")}。`
      : "我們用同一份對戰教材逐項對照說明，不憑空報數字。";
  const close = /收尾|家人/.test(qa.q)
    ? "您跟家人討論後，我再幫您保留試算表與試乘時段，不逼今天下訂。"
    : "建議用您的年里程當場試算，並安排試乘讓您實際感受差異。";
  const full = `${empathy}\n${factPart}\n${close}`;
  const blank = buildBlankFromFull(full, [
    empathy.slice(0, 16),
    lines[0]?.slice(0, 24) ?? "本場教材",
    close.slice(0, 20),
  ]);
  return { full: full.replace(/\n/g, "<br/>"), blank };
}

export async function enrichSingleQuestion(
  qa: QA,
  ctx: {
    product: string;
    competitor: string;
    short: string;
    facts: { label: string; value: string }[];
    closingActions: string[];
  },
): Promise<QA> {
  const topic = topicFromQa(qa);
  const customerAsk = qa.q.replace(/^[「【]/, "").replace(/[」】]$/, "");
  const factsBlock = formatFactsForPrompt(ctx.facts, ctx.competitor, topic, customerAsk);
  const shortComp = normalizeCompetitorToken(ctx.competitor);
  const close = ctx.closingActions[0] ?? "邀請試乘";

  const prompt = `你是汽車銷售培訓教練。請依【Vertex RAG 教材】撰寫業代「口語高分答」，給受訓業代當詳解參考。

【本品】${ctx.product}
【競品】${ctx.competitor}（簡稱 ${shortComp}）
【客戶問】${customerAsk}
【本題議題】${qa.topic ?? topic}
【評分重點】${qa.score ?? "—"}

【教材 — 只能引用以下內容，不得捏造數字或規格】
${factsBlock}

【撰寫規則】
1. 結構：同理承接（1句）→ 教材事實／數據（1～2句，含具體數字若教材有）→ 引導試算或${close}（1句）
2. 口語、展間可當場說；禁止 PDF 檔名、禁止「重點1」教練標籤、禁止攻擊競品
3. 若教材無某數字，勿編造；改說明比較基準或邀請試乘驗證
4. 全文 80～180 字，用 \\n 分段（2～4 段）

輸出 JSON：
{
  "full": "完整口語詳解",
  "blankPhrases": ["關鍵短語1", "含數字的教材句片段", "試算或試乘行動語"],
  "ragUsed": ["你引用了教材哪幾點，簡短列點"]
}`;

  const raw = await geminiGenerateText(prompt, {
    json: true,
    maxOutputTokens: 900,
    temperature: 0.25,
  });

  if (!raw) {
    const fb = fallbackEnrich(qa, factsBlock);
    return { ...qa, full: fb.full, blank: fb.blank };
  }

  const parsed = parseEnrichJson(raw);
  if (!parsed?.full?.trim()) {
    const fb = fallbackEnrich(qa, factsBlock);
    return { ...qa, full: fb.full, blank: fb.blank };
  }

  const fullText = parsed.full.trim().replace(/\n/g, "<br/>");
  const phrases = (parsed.blankPhrases ?? [])
    .map((p) => String(p).trim())
    .filter((p) => p.length >= 4)
    .slice(0, 4);
  const plain = parsed.full.trim();
  const blank =
    phrases.length > 0
      ? buildBlankFromFull(plain, phrases).replace(/\n/g, "<br/>")
      : fallbackEnrich(qa, factsBlock).blank;

  return {
    ...qa,
    full: fullText,
    blank,
    score: qa.score
      ? `${qa.score}${parsed.ragUsed?.length ? " · RAG核對" : ""}`
      : qa.score,
  };
}

export async function enrichChapterWithGemini(
  chapter: CompetitorChapter,
  ragInput: RagChapterInput,
  opts?: { delayMs?: number; onProgress?: (msg: string) => void },
): Promise<CompetitorChapter> {
  const delay = opts?.delayMs ?? 400;
  const questions: QA[] = [];

  for (const qa of chapter.questions) {
    opts?.onProgress?.(`  enrich ${qa.id} …`);
    const enriched = await enrichSingleQuestion(qa, {
      product: chapter.product,
      competitor: chapter.competitor,
      short: chapter.short,
      facts: ragInput.facts,
      closingActions: ragInput.closingActions,
    });
    questions.push(enriched);
    if (delay > 0) await sleep(delay);
  }

  return { ...chapter, questions };
}
