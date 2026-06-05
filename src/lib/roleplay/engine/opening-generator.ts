import { randomUUID } from "node:crypto";
import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import { pickRandom } from "@/lib/roleplay/catalog";
import {
  sanitizeCustomerUtterance,
  isCoachOnlySnippet,
} from "@/lib/roleplay/customer-text-sanitize";
import {
  ageRangePrompt,
  difficultyBehaviorPrompt,
  normalizeDrillDifficulty,
} from "@/lib/roleplay/engine/difficulty-behavior";
import type { RoleplayPersona, RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";
import type { RoleplayRagBundle } from "@/lib/roleplay/rag-context";

export type RoleplayOpeningBrief = {
  openingLine: string;
  coreIssue: string;
  followUps: string[];
};

const CONCERN_ANGLES = [
  "配備與科技",
  "安全與輔助",
  "空間與乘坐",
  "價格與優惠",
  "保值、保固與養護",
  "駕駛感受與品牌",
  "油耗與用車成本",
  "試乘與交車時程",
] as const;

const SAFE_OPENING_TEMPLATES = [
  "我在比 {product} 跟 {competitor}，想先了解你們這台在{topic}方面表現如何？",
  "朋友推 {competitor}，但我對 {product} 的{topic}比較在意，能簡單說明嗎？",
  "網路上兩台車評價不一，我主要想搞懂{topic}，你會怎麼建議我比較？",
  "這週想安排試乘，{product} 跟 {competitor} 你覺得我該先從哪個方向看起？",
  "預算有限，{product} 跟 {competitor} 在{topic}上差異大嗎？",
  "我最近在查 {competitor} 跟 {product}，{topic} 這塊兩台差在哪？",
] as const;

const FALLBACK_OPENINGS: { line: string; note: string }[] = [
  {
    line: "我在比 {product} 跟 {competitor}，想先了解你們這台最讓人有感的地方在哪？",
    note: "客戶尚未鎖定單一議題，等待業代引導。",
  },
  {
    line: "朋友推 {competitor}，但我對 {product} 也有興趣，你會建議我從哪裡開始看？",
    note: "客戶處於比較初期，語氣中性。",
  },
  {
    line: "我網路上看過兩台評價，想聽你實際介紹 {product} 時大家最常問什麼？",
    note: "客戶帶著網路資訊來店，想驗證業代說法。",
  },
];

const FALLBACK_FOLLOW_UPS = [
  "你剛說的我有聽懂，但跟 {competitor} 比還是有落差，能再具體一點嗎？",
  "官網規格我看過了，我想知道實際用起來的差別。",
  "如果差不多，為什麼我要選 {product} 而不是 {competitor}？",
  "聽起來偏概括，有沒有數字可以參考？",
  "我還是要回去跟家人商量，今天先了解到這裡。",
  "論壇上說法不一樣，想聽你們官方怎麼解釋？",
];

function fillTemplate(
  tpl: string,
  product: string,
  competitor: string,
  topic?: string,
): string {
  return tpl
    .replace(/\{product\}/g, product)
    .replace(/\{competitor\}/g, competitor)
    .replace(/\{topic\}/g, topic ?? "重點規格");
}

function useLlmOpening(): boolean {
  const raw = (process.env.ROLEPLAY_OPENING_USE_LLM ?? "false").trim().toLowerCase();
  return raw === "true" || raw === "1";
}

function pickConsumerTopicFromRag(rag: RoleplayRagBundle, angle: string): string {
  for (const kp of rag.keyPoints) {
    if (!isCoachOnlySnippet(kp)) {
      const short = kp.replace(FILE_OR_SOURCE_PAT, "").trim().slice(0, 12);
      if (short.length >= 4) return short;
    }
  }
  return angle;
}

const FILE_OR_SOURCE_PAT =
  /[A-Za-z0-9_-]+\.(pdf|xlsx|xls)|\(page\s*\d+\)|工作表\d*|T33_ICE|KB-[A-Z0-9-]+/gi;

/** 僅用面向 + 安全模板，絕不把 RAG 檔名／教練話術塞進客戶開場 */
function ragRulesBrief(
  product: string,
  competitor: string,
  persona: RoleplayPersona,
  rag: RoleplayRagBundle,
): RoleplayOpeningBrief {
  const angle = pickRandom(CONCERN_ANGLES);
  const topic = pickConsumerTopicFromRag(rag, angle);
  const tpl = pickRandom(SAFE_OPENING_TEMPLATES);
  let openingLine = fillTemplate(tpl, product, competitor, topic);
  if (!sanitizeCustomerUtterance(openingLine)) {
    openingLine = fillTemplate(pickRandom(FALLBACK_OPENINGS).line, product, competitor);
  }

  const followUps = FALLBACK_FOLLOW_UPS.map((f) =>
    sanitizeCustomerUtterance(fillTemplate(f, product, competitor)) ||
    fillTemplate(f, product, competitor),
  ).slice(0, 6);

  return {
    openingLine,
    coreIssue: `客戶（${persona.name}）關心 ${angle}。`,
    followUps,
  };
}

function fallbackBrief(product: string, competitor: string): RoleplayOpeningBrief {
  const seed = pickRandom(FALLBACK_OPENINGS);
  const followUps = FALLBACK_FOLLOW_UPS.map((f) =>
    fillTemplate(f, product, competitor),
  ).slice(0, 6);
  return {
    openingLine: fillTemplate(seed.line, product, competitor),
    coreIssue: seed.note,
    followUps,
  };
}

function finalizeBrief(brief: RoleplayOpeningBrief): RoleplayOpeningBrief {
  const openingLine =
    sanitizeCustomerUtterance(brief.openingLine) ||
    "你好，我在考慮這台車，想先聽你怎麼介紹？";
  const followUps = brief.followUps
    .map((f) => sanitizeCustomerUtterance(f) || f)
    .filter((f) => f.length >= 4)
    .slice(0, 6);
  return {
    openingLine,
    coreIssue: brief.coreIssue,
    followUps: followUps.length >= 3 ? followUps : fallbackBrief("", "").followUps,
  };
}

type LlmOpeningPayload = {
  openingLine?: string;
  coreIssue?: string;
  followUps?: string[];
};

async function llmOpeningBrief(input: {
  config: RoleplaySessionConfig;
  productDisplayName: string;
  persona: RoleplayPersona;
  rag: RoleplayRagBundle;
}): Promise<RoleplayOpeningBrief> {
  const { config, productDisplayName, persona, rag } = input;
  const competitor = config.competitor;
  const angle = pickRandom(CONCERN_ANGLES);
  const sessionNonce = randomUUID().slice(0, 8);
  const diff = normalizeDrillDifficulty(config.difficulty);

  const prompt = `你是汽車展間對練的「客戶開場設計器」。產出客戶口吻開場，禁止出現檔名、PDF、頁碼、KB代碼、教練話術、業代指引。

【隨機種子】${sessionNonce}
【切入面向】${angle}
【車型】${productDisplayName} vs ${competitor}
【人設】${persona.name}：${persona.style}
${ageRangePrompt(config.ageRange)}
${difficultyBehaviorPrompt(diff)}

輸出 JSON：{"openingLine":"客戶1～2句","coreIssue":"教練用一句","followUps":["4～6句客戶追問"]}`;

  const raw = await geminiGenerateText(prompt, {
    json: true,
    maxOutputTokens: 520,
    temperature: 0.88,
  });

  if (!raw) return ragRulesBrief(productDisplayName, competitor, persona, rag);

  try {
    const parsed = JSON.parse(raw) as LlmOpeningPayload;
    const openingLine = parsed.openingLine?.trim();
    if (!openingLine || openingLine.length < 6) {
      return ragRulesBrief(productDisplayName, competitor, persona, rag);
    }
    return finalizeBrief({
      openingLine,
      coreIssue: parsed.coreIssue?.trim() || `客戶關心：${angle}`,
      followUps: (parsed.followUps ?? []).map((s) => String(s ?? "").trim()).filter(Boolean),
    });
  } catch {
    return ragRulesBrief(productDisplayName, competitor, persona, rag);
  }
}

export async function generateRoleplayOpeningBrief(input: {
  config: RoleplaySessionConfig;
  productDisplayName: string;
  persona: RoleplayPersona;
  rag: RoleplayRagBundle;
}): Promise<RoleplayOpeningBrief> {
  const { config, productDisplayName, persona, rag } = input;
  const competitor = config.competitor;

  let brief: RoleplayOpeningBrief;
  if (useLlmOpening()) {
    brief = await llmOpeningBrief(input);
  } else if (rag.facts.length === 0 && rag.keyPoints.length === 0) {
    brief = fallbackBrief(productDisplayName, competitor);
  } else {
    brief = ragRulesBrief(productDisplayName, competitor, persona, rag);
  }

  return finalizeBrief(brief);
}
