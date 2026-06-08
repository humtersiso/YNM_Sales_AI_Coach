import { randomUUID } from "node:crypto";
import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import { pickRandom } from "@/lib/roleplay/catalog";
import { sanitizeCustomerUtterance } from "@/lib/roleplay/customer-text-sanitize";
import {
  ageRangePrompt,
  difficultyBehaviorPrompt,
  normalizeDrillDifficulty,
} from "@/lib/roleplay/engine/difficulty-behavior";
import type { RoleplayPersona, RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";
import type { RoleplayRagBundle } from "@/lib/roleplay/rag-context";
import { isValidRagFact } from "@/lib/roleplay/rag-context";

export type RoleplayOpeningBrief = {
  openingLine: string;
  coreIssue: string;
  followUps: string[];
};

const CONCERN_ANGLES = [
  "油耗跟一年油錢",
  "空間跟乘坐舒適",
  "安全跟輔助駕駛",
  "價格跟優惠方案",
  "保養跟回廠費用",
  "配備跟科技感受",
  "試乘跟實際路感",
] as const;

const THEME_PATTERNS: { re: RegExp; topic: string }[] = [
  { re: /油耗|km\/L|WLTC|油錢|省油|用車成本/i, topic: "油耗跟一年油錢" },
  { re: /保養|定保|回廠|保修|妥善/i, topic: "保養跟回廠費用" },
  { re: /ProPILOT|輔助|安全|AEB|防撞/i, topic: "安全跟輔助駕駛" },
  { re: /空間|後座|行李|乘坐/i, topic: "空間跟乘坐舒適" },
  { re: /價格|優惠|促銷|方案|月供/i, topic: "價格跟優惠方案" },
  { re: /配備|科技|隔音|舒適/i, topic: "配備跟科技感受" },
];

const NATURAL_OPENINGS = [
  "我最近在比 {product} 跟 {competitor}，{hook}，想先聽你怎麼說？",
  "朋友一直推 {competitor}，但我對 {product} 也有興趣，{hook}。",
  "網路上兩台車評價不一樣，我主要在意{topic}，你會建議我怎麼比？",
  "這週想來試乘，{product} 跟 {competitor} 在{topic}上差很多嗎？",
] as const;

const NATURAL_HOOKS = [
  "網路上油耗說法不一樣",
  "我在意長期用車成本",
  "家人比較關心空間跟安全",
  "預算有限想比較划算",
  "論壇討論很多我想確認一下",
] as const;

const NATURAL_FOLLOW_UPS = [
  "你剛說的我有聽懂，但跟 {competitor} 比還是有點模糊，能再具體一點嗎？",
  "官網規格我看過了，我想知道實際用起來跟 {competitor} 差在哪？",
  "如果差不多，為什麼我要選 {product} 而不是 {competitor}？",
  "聽起來有點空，有沒有數字或試算可以參考？",
  "我還是要回去跟家人商量，今天先了解到這裡。",
  "論壇上說法不一樣，想聽你們實際怎麼解釋？",
];

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  return out;
}

function isCoachLikeLabel(label: string): boolean {
  return /重點|佐證|fact|KB-|\.pdf|工作表|page\s*\d/i.test(label);
}

/** 從 RAG 內容推斷買家會講的議題，不用檔名或教練標籤 */
function inferConsumerTopic(fact: { label: string; value: string }): string {
  const text = `${fact.label} ${fact.value}`;
  for (const p of THEME_PATTERNS) {
    if (p.re.test(text)) return p.topic;
  }
  return pickRandom(CONCERN_ANGLES);
}

function collectThemes(rag: RoleplayRagBundle): string[] {
  const themes: string[] = [];
  for (const f of rag.facts.filter(isValidRagFact)) {
    const t = inferConsumerTopic(f);
    if (!themes.includes(t)) themes.push(t);
  }
  return themes.length > 0 ? themes : [pickRandom(CONCERN_ANGLES)];
}

/** 規則式備援：口語開場，不照搬 fact 標籤 */
export function deriveBriefFromRag(
  rag: RoleplayRagBundle,
  product: string,
  competitor: string,
  persona: RoleplayPersona,
): RoleplayOpeningBrief {
  const themes = collectThemes(rag);
  const topic = themes[0]!;
  const hook = pickRandom(NATURAL_HOOKS);
  const tpl = pickRandom(NATURAL_OPENINGS);
  let openingLine = fillTemplate(tpl, { product, competitor, topic, hook });
  if (!sanitizeCustomerUtterance(openingLine)) {
    openingLine = `我在比 ${product} 跟 ${competitor}，想先了解${topic}。`;
  }

  const shortComp = competitor.replace(/^(Toyota|Honda|Hyundai|Mitsubishi|KIA)\s+/i, "");
  const followUps = [
    fillTemplate(pickRandom(NATURAL_FOLLOW_UPS), { product, competitor: shortComp }),
    ...themes.slice(1, 4).map((t) =>
      `另外我也想搞懂${t}，跟 ${shortComp} 比起來怎樣？`,
    ),
    fillTemplate(NATURAL_FOLLOW_UPS[4]!, { product, competitor: shortComp }),
  ]
    .map((f) => sanitizeCustomerUtterance(f) || f)
    .filter((f) => f.length >= 6)
    .slice(0, 6);

  return {
    openingLine,
    coreIssue: `客戶（${persona.name}）關心 ${topic}，並與 ${competitor} 比較。`,
    followUps,
  };
}

function useLlmOpening(): boolean {
  const raw = (process.env.ROLEPLAY_OPENING_USE_LLM ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0";
}

function finalizeBrief(brief: RoleplayOpeningBrief): RoleplayOpeningBrief {
  const openingLine =
    sanitizeCustomerUtterance(brief.openingLine) ||
    "你好，我在考慮這台車，想先聽你怎麼介紹？";
  const followUps = brief.followUps
    .map((f) => sanitizeCustomerUtterance(f) || f)
    .filter((f) => f.length >= 6)
    .slice(0, 6);
  return { openingLine, coreIssue: brief.coreIssue, followUps };
}

type LlmOpeningPayload = {
  openingLine?: string;
  coreIssue?: string;
  followUps?: string[];
};

function formatFactsForCoachPrompt(rag: RoleplayRagBundle): string {
  return rag.facts
    .filter(isValidRagFact)
    .map((f) => {
      const label = isCoachLikeLabel(f.label) ? inferConsumerTopic(f) : f.label;
      return `- 議題方向：${label}｜教材摘要：${f.value.slice(0, 200)}`;
    })
    .join("\n");
}

async function llmOpeningBrief(input: {
  config: RoleplaySessionConfig;
  productDisplayName: string;
  persona: RoleplayPersona;
  rag: RoleplayRagBundle;
}): Promise<RoleplayOpeningBrief> {
  const { config, productDisplayName, persona, rag } = input;
  const competitor = config.competitor;
  const sessionNonce = randomUUID().slice(0, 8);
  const diff = normalizeDrillDifficulty(config.difficulty);
  const factsBlock = formatFactsForCoachPrompt(rag);

  const prompt = `你是展間「買家」台詞設計器。依下列教材摘要，寫出真實客戶會講的開場與追問。
禁止：檔名、PDF、KB代碼、教練用語、「重點1」「佐證」「表現如何」這類機械句。
要像真人：「網路上都說 RAV4 比較省油」「保養一年到底多少」這種口語。
議題不可超出教材摘要，但用詞必須自然。

【種子】${sessionNonce}
【比較】${productDisplayName} vs ${competitor}
【人設】${persona.name}：${persona.style}
${ageRangePrompt(config.ageRange)}
${difficultyBehaviorPrompt(diff)}

【教材摘要（出題範圍，勿逐字外露）】
${factsBlock}

輸出 JSON：
{"openingLine":"客戶1～2句口語","coreIssue":"教練用一句（不給客戶看）","followUps":["4～6句客戶追問，口語、自然"]}`;

  const raw = await geminiGenerateText(prompt, {
    json: true,
    maxOutputTokens: 600,
    temperature: 0.82,
  });

  if (!raw) return deriveBriefFromRag(rag, productDisplayName, competitor, persona);

  try {
    const parsed = JSON.parse(raw) as LlmOpeningPayload;
    const openingLine = parsed.openingLine?.trim();
    if (!openingLine || openingLine.length < 8) {
      return deriveBriefFromRag(rag, productDisplayName, competitor, persona);
    }
    return finalizeBrief({
      openingLine,
      coreIssue:
        parsed.coreIssue?.trim() ||
        deriveBriefFromRag(rag, productDisplayName, competitor, persona).coreIssue,
      followUps: (parsed.followUps ?? []).map((s) => String(s ?? "").trim()).filter(Boolean),
    });
  } catch {
    return deriveBriefFromRag(rag, productDisplayName, competitor, persona);
  }
}

export async function generateRoleplayOpeningBrief(input: {
  config: RoleplaySessionConfig;
  productDisplayName: string;
  persona: RoleplayPersona;
  rag: RoleplayRagBundle;
}): Promise<RoleplayOpeningBrief> {
  const { config, productDisplayName, persona, rag } = input;

  if (!rag.coverageOk) {
    return finalizeBrief({
      openingLine: "你好，我在考慮這台車，想先了解一下。",
      coreIssue: "RAG 教材不足，等待業代引導。",
      followUps: [],
    });
  }

  const brief = useLlmOpening()
    ? await llmOpeningBrief(input)
    : deriveBriefFromRag(rag, productDisplayName, config.competitor, persona);

  return finalizeBrief(brief);
}
