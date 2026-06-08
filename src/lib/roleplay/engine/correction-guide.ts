import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";

function cleanFactExcerpt(value: string): string {
  return value
    .replace(/Do not use without any permission[\s\S]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

type TopicKind = "fuel" | "sound" | "blind" | "maintenance" | "advance";

const TOPIC_NUMERIC_HINT: Record<Exclude<TopicKind, "advance">, RegExp> = {
  fuel: /油耗|km\/L|WLTC|油費|油資|萬|公里|試算/,
  sound: /分貝|隔音|玻璃|\d+/,
  blind: /吋|旋鈕|按鍵|螢幕|\d+/,
  maintenance: /定保|保養|萬|元|零件|維修|電池|千/,
};

export function hasConcreteNumbers(text: string): boolean {
  return /\d[\d,.]*(?:\s*(?:萬|公里|km\/L|km|分貝|元|千|%))?/i.test(text);
}

export function isVagueCorrectGuide(guide: string): boolean {
  const t = guide.trim();
  if (t.length < 12) return true;
  if (/依教材|依 RAG|針對客戶問題|請參考|重點回應|教材整理|…\s*$/.test(t)) return true;
  if (t.endsWith("…") && !hasConcreteNumbers(t)) return true;
  return false;
}

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
  topic: Exclude<TopicKind, "advance">,
): string[] {
  const re = TOPIC_NUMERIC_HINT[topic];
  const out: string[] = [];
  for (const f of scenario.sectionC.facts) {
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
  if (topic === "advance") {
    return "這週六上午方便嗎？我幫您安排 30 分鐘試駕，現場用十年 10 萬公里試算表對照油資與保養，讓數字一次看清楚。";
  }

  const lines = allFactsNumericLines(scenario, topic);
  if (lines.length === 0) {
    const any = numericSentences(
      scenario.sectionC.facts.map((f) => `${f.label} ${f.value}`).join(" "),
    );
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
        : "針對您剛才的問題，";

  return `${opener}${lines.slice(0, 2).join("，")}。`;
}
