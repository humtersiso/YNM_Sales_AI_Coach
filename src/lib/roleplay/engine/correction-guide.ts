import { ROLEPLAY_COMPETITORS_XTRAIL } from "@/lib/roleplay/catalog";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";

function cleanFactExcerpt(value: string): string {
  return value
    .replace(/Do not use without any permission[\s\S]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

type TopicKind = "fuel" | "sound" | "blind" | "maintenance" | "advance" | "competitor";

/** 競品全名 → 搜尋用別名（含簡稱） */
const COMPETITOR_ALIASES: Record<string, RegExp> = {
  "Toyota RAV4": /RAV4|豐田\s*RAV4/i,
  "Honda CR-V": /CR[-\s]?V|Honda\s*CR/i,
  "Hyundai Tucson L": /Tucson|TUCSON|途勝/i,
  "Mitsubishi Outlander": /Outlander|歐藍德/i,
  "KIA Sportage": /Sportage|SPORTAGE|斯波特|起亚/i,
};

export function hasConcreteNumbers(text: string): boolean {
  return /\d[\d,.]*(?:\s*(?:萬|公里|km\/L|km|分貝|元|千|%))?/i.test(text);
}

/** 大陸或非台灣汽車業代口語 */
export function hasNonTaiwanCarTerms(text: string): boolean {
  return /售後|性價比|提車|配置(?!表)|保養週期|用戶體驗|落地價|裸車價/.test(text);
}

export function isVagueCorrectGuide(guide: string): boolean {
  const t = guide.trim();
  if (t.length < 12) return true;
  if (hasNonTaiwanCarTerms(t)) return true;
  if (/依教材|依 RAG|針對客戶問題|請參考|重點回應|教材整理|重點\s*\d|舊世代\s*HEV|vs\.\s*重點|…\s*$/.test(t)) {
    return true;
  }
  if (t.endsWith("…") && !hasConcreteNumbers(t)) return true;
  return false;
}

/** 從全名取出簡稱 token（例：Honda CR-V → CR-V） */
export function normalizeCompetitorToken(name: string): string {
  const t = name.trim();
  if (/CR[-\s]?V/i.test(t)) return "CR-V";
  if (/RAV4/i.test(t)) return "RAV4";
  if (/Sportage/i.test(t)) return "Sportage";
  if (/Tucson/i.test(t)) return "Tucson L";
  if (/Outlander/i.test(t)) return "Outlander";
  return t.split(/\s+/).pop() ?? t;
}

/** 文字中提及的競品全名列表 */
export function getMentionedCompetitors(text: string): string[] {
  const found: string[] = [];
  for (const full of ROLEPLAY_COMPETITORS_XTRAIL) {
    if (COMPETITOR_ALIASES[full]?.test(text)) found.push(full);
  }
  return found;
}

/** 文字是否提及本場競品 */
export function mentionsSessionCompetitor(text: string, sessionCompetitor: string): boolean {
  const aliases = COMPETITOR_ALIASES[sessionCompetitor];
  if (aliases?.test(text)) return true;
  const token = normalizeCompetitorToken(sessionCompetitor);
  return new RegExp(token.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i").test(text);
}

/** 文字中提及的非本場競品 */
export function getOtherCompetitorMentions(text: string, sessionCompetitor: string): string[] {
  return getMentionedCompetitors(text).filter((c) => c !== sessionCompetitor);
}

/** 客戶是否指正業代比錯車款 */
export function customerCorrectedCompetitor(customer: string): boolean {
  return /比錯|都在講|我問的是|首選對手|怎麼.*講|整篇都在講|不是.*對手|應該.*比較|怎麼一直|一直拿|跳開|避重就輕/i.test(
    customer,
  );
}

/** 業代回覆主要針對錯誤競品（提及他牌但未對準本場競品） */
export function answerTargetsWrongCompetitor(
  agent: string,
  sessionCompetitor: string,
  customerContext?: string,
): boolean {
  const others = getOtherCompetitorMentions(agent, sessionCompetitor);
  if (others.length === 0) return false;
  if (mentionsSessionCompetitor(agent, sessionCompetitor)) return false;
  if (customerContext && mentionsSessionCompetitor(customerContext, sessionCompetitor)) {
    return true;
  }
  return others.length > 0;
}

type FactRow = { label: string; value: string };

function factText(f: FactRow): string {
  return `${f.label} ${f.value}`;
}

function factMentionsOtherCompetitors(f: FactRow, sessionCompetitor: string): boolean {
  return getOtherCompetitorMentions(factText(f), sessionCompetitor).length > 0;
}

function factMentionsSessionCompetitor(f: FactRow, sessionCompetitor: string): boolean {
  return mentionsSessionCompetitor(factText(f), sessionCompetitor);
}

/**
 * 依本場競品過濾 RAG facts：
 * 1. 含本場競品
 * 2. 通用（未提及其他競品）
 * 排除主要描述其他競品的段落（除非 customerAsk 有提到）
 */
export function filterFactsForSession(
  facts: FactRow[],
  sessionCompetitor: string,
  customerAsk?: string,
): FactRow[] {
  const allowedOthers = customerAsk ? getMentionedCompetitors(customerAsk) : [];
  const sessionFacts = facts.filter((f) => factMentionsSessionCompetitor(f, sessionCompetitor));
  const neutralFacts = facts.filter(
    (f) =>
      !factMentionsSessionCompetitor(f, sessionCompetitor) &&
      !factMentionsOtherCompetitors(f, sessionCompetitor),
  );
  const allowedOtherFacts = facts.filter((f) => {
    const others = getOtherCompetitorMentions(factText(f), sessionCompetitor);
    return others.some((o) => allowedOthers.includes(o));
  });
  return [...sessionFacts, ...neutralFacts, ...allowedOtherFacts];
}

/** correctGuide 是否含不應出現的其他競品名 */
export function isWrongCompetitorInGuide(
  guide: string,
  sessionCompetitor: string,
  customerAsk?: string,
): boolean {
  const allowed = new Set([
    sessionCompetitor,
    normalizeCompetitorToken(sessionCompetitor),
    ...(customerAsk ? getMentionedCompetitors(customerAsk) : []),
  ]);
  for (const full of ROLEPLAY_COMPETITORS_XTRAIL) {
    if (allowed.has(full)) continue;
    if (allowed.has(normalizeCompetitorToken(full))) continue;
    if (COMPETITOR_ALIASES[full]?.test(guide)) return true;
  }
  return false;
}

const TOPIC_NUMERIC_HINT: Record<Exclude<TopicKind, "advance" | "competitor">, RegExp> = {
  fuel: /油耗|km\/L|WLTC|油費|油資|萬|公里|試算/,
  sound: /分貝|隔音|玻璃|\d+/,
  blind: /吋|旋鈕|按鍵|螢幕|\d+/,
  maintenance: /定保|保養|萬|元|零件|維修|電池|千/,
};

function numericSentences(text: string, topicRe?: RegExp): string[] {
  const clean = cleanFactExcerpt(text);
  return clean
    .split(/[。！？\n；]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && hasConcreteNumbers(s))
    .filter((s) => (topicRe ? topicRe.test(s) : true))
    .slice(0, 4);
}

function allFactsNumericLines(
  scenario: RoleplayScenario,
  topic: Exclude<TopicKind, "advance" | "competitor">,
  customerAsk?: string,
): string[] {
  const re = TOPIC_NUMERIC_HINT[topic];
  const facts = filterFactsForSession(
    scenario.sectionC.facts,
    scenario.sectionA.competitor,
    customerAsk,
  );
  const out: string[] = [];
  for (const f of facts) {
    for (const s of numericSentences(`${f.label} ${f.value}`, re)) {
      if (!out.some((u) => u.slice(0, 20) === s.slice(0, 20))) out.push(s);
    }
  }
  return out;
}

/** 從 RAG 事實組出含具體數字的建議說法（不依賴 LLM） */
export function buildConcreteCorrectGuide(
  scenario: RoleplayScenario,
  topic: TopicKind,
  customerAsk?: string,
): string {
  const sessionComp = scenario.sectionA.competitor;
  const shortComp = normalizeCompetitorToken(sessionComp);
  const product = scenario.sectionA.productDisplayName || "X-TRAIL";

  if (topic === "advance") {
    return `這週六上午方便嗎？我幫您安排 30 分鐘試駕，現場用十年 10 萬公里試算表對照 ${shortComp} 與 ${product} 的油資與保養，讓數字一次看清楚。`;
  }

  if (topic === "competitor") {
    const facts = filterFactsForSession(scenario.sectionC.facts, sessionComp, customerAsk);
    const fuelLines = facts.flatMap((f) =>
      numericSentences(`${f.label} ${f.value}`, TOPIC_NUMERIC_HINT.fuel),
    );
    const maintLines = facts.flatMap((f) =>
      numericSentences(`${f.label} ${f.value}`, TOPIC_NUMERIC_HINT.maintenance),
    );
    const lines = [...fuelLines, ...maintLines].slice(0, 2);
    if (lines.length > 0) {
      return `您要比的是 ${shortComp}，我們用同一張十年 10 萬公里試算表，把車價、稅金、油資與保養加總跟 ${shortComp} 對照：${lines.join("，")}。`;
    }
    return `您要比的是 ${shortComp}，請先確認客戶首選對手，再用 ${product} 與 ${shortComp} 的試算表逐項說明車價、稅金、油資與保養差異。`;
  }

  const lines = allFactsNumericLines(scenario, topic, customerAsk);
  if (lines.length === 0) {
    const facts = filterFactsForSession(scenario.sectionC.facts, sessionComp, customerAsk);
    const any = numericSentences(facts.map((f) => `${f.label} ${f.value}`).join(" "));
    if (any.length > 0) {
      return `${any.slice(0, 2).join("。")}。`;
    }
    return "";
  }

  const opener = customerAsk?.includes("油耗") || customerAsk?.includes("油費")
    ? "針對您問的油耗與用車成本，"
    : customerAsk?.includes("保養") || customerAsk?.includes("定保")
      ? "關於保養與回廠費用，"
      : customerAsk?.includes("隔音") || customerAsk?.includes("分貝")
        ? "隔音數據方面，"
        : `針對 ${shortComp} 的比較，`;

  return `${opener}${lines.slice(0, 2).join("，")}。`;
}
