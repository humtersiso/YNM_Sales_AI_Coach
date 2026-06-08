import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import type { RoleplayAgeRange, RoleplayDifficulty } from "@/lib/roleplay/scenario-contract";
import {
  buildConcreteCorrectGuide,
  hasConcreteNumbers,
  isVagueCorrectGuide,
} from "@/lib/roleplay/engine/correction-guide";
import { inferCorrectionCategory, normalizeCorrectionPoint } from "@/lib/roleplay/engine/correction-utils";
import { coalesceAdjacentAgentTurns } from "@/lib/roleplay/engine/turn-coalesce";
import type {
  RoleplayChatTurn,
  RoleplayCorrectionCategory,
  RoleplayCorrectionPoint,
} from "@/lib/roleplay/session-types";

export { inferCorrectionCategory, normalizeCorrectionPoint };

type TopicKind = "fuel" | "sound" | "blind" | "maintenance";

type CorrectionCandidate = {
  issue: string;
  category: RoleplayCorrectionCategory;
  whatYouSaid: string;
  customerAsk: string;
  topic: TopicKind | "advance";
};

const TOPIC_PATTERNS: Record<TopicKind, RegExp> = {
  fuel: /油耗|km\/L|WLTC|油資|用車成本|測試條件|路況|市區|高速/,
  sound: /隔音|玻璃|分貝|NVH|靜音|噪音/,
  blind: /旋鈕|按鍵|盲|螢幕|操作|觸控/,
  maintenance: /保養|回廠|定保|零件|保修|維修|引擎|耐用|CVT/,
};

const CUSTOMER_ASK: Record<TopicKind, RegExp> = {
  fuel: /油耗|WLTC|測試|路況|市區|高速|路上跑|油錢|持有成本|試算|成本|估算|十年|10年|差距|30\s*萬|稅金|車價/,
  sound: /隔音|玻璃|分貝|靜音|噪音|吵/,
  blind: /盲|旋鈕|按鍵|螢幕|操作|觸控|整合/,
  maintenance: /保養|回廠|零件|保修|定保|維修|引擎|故障|耐用|維護/,
};

const AGENT_TOPIC_COVERED: Record<TopicKind, RegExp> = {
  fuel: /WLTC|測試條件|市區.*高速|高速.*市區|年里程|km\/L|綜合油耗|油費|兩萬公里|萬公里/,
  sound: /隔音|雙層|分貝|玻璃|NVH|靜音|噪音|\d+\s*分貝/,
  blind: /旋鈕|按鍵|盲|實體|語音|冷氣.*旋|冷氣.*按/,
  maintenance: /保養|回廠|定保|2[～-]?5\s*千|1[～-]?2\s*萬|零件|維修|引擎|CVT|耐用|延長保固|電池/,
};

/** 十年成本／試算／預約等，視為已回應成本或保養面向 */
const LOOSE_COST_COVERED =
  /持有成本|十年|10年|10萬|試算|車價|折扣|稅金|油資|電池|表格|預約|加總|總成本|用車成本表/;

const SESSION_ADVANCE =
  /試乘|試駕|預約|方便.*看|試算表|週[一二三四五六日天]|明天|安排|來店|約.*時/;

const ISSUE_LABEL: Record<TopicKind, string> = {
  fuel: "客戶問油耗／持有成本，該輪未正面回應",
  sound: "客戶問隔音／玻璃，該輪未帶出具體數據",
  blind: "客戶問操作／盲操，該輪未具體說明",
  maintenance: "客戶問保養／回廠，該輪未說明費用或頻率",
};

const STRATEGY_DEFER_ISSUE = "客戶要求當場說明，該輪只延後到試乘才提供";
const STRATEGY_RUDE_ISSUE = "邀約語氣過於敷衍，未先回應客戶疑慮";

export function cleanFactExcerpt(value: string): string {
  return value
    .replace(/Do not use without any permission[\s\S]*/gi, "")
    .replace(/All rights reserved[\s\S]*/gi, "")
    .replace(/Confidential[\s\S]*/gi, "")
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTalkingPoints(value: string, topic: TopicKind): string[] {
  const clean = cleanFactExcerpt(value);
  const chunks = clean
    .split(/[。！？\n•]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 120);
  const re = TOPIC_PATTERNS[topic];
  const unique: string[] = [];
  for (const h of chunks.filter((s) => re.test(s))) {
    const key = h.slice(0, 24);
    if (!unique.some((u) => u.slice(0, 24) === key)) unique.push(h);
  }
  return unique.slice(0, 3);
}

function bestFactForTopic(
  scenario: RoleplayScenario,
  topic: TopicKind,
): { label: string; value: string } | null {
  let best: { label: string; value: string } | null = null;
  let bestScore = 0;
  for (const f of scenario.sectionC.facts) {
    const score = extractTalkingPoints(f.value, topic).length;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return bestScore > 0 ? best : scenario.sectionC.facts[0] ?? null;
}

function isSubstantiveCustomerLine(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (/^(好的|了解|嗯|謝謝|再考慮)/.test(t)) return false;
  return true;
}

function isOpeningGreeting(text: string): boolean {
  const t = text.trim();
  if (t.length >= 120) return false;
  if (!/您好|歡迎|在看這台|有什麼問題|都可以為您說明|都可以問我/.test(t)) {
    return false;
  }
  // 合併招呼＋正文時，正文有實質內容就不視為純開場
  const rest = t
    .replace(/您好[^。！？\n]*[。！？]?/g, "")
    .replace(/歡迎[^。！？\n]*[。！？]?/g, "")
    .trim();
  return rest.length < 20;
}

function customerTopics(text: string): TopicKind[] {
  const topics: TopicKind[] = [];
  if (CUSTOMER_ASK.fuel.test(text)) topics.push("fuel");
  if (CUSTOMER_ASK.sound.test(text)) topics.push("sound");
  if (CUSTOMER_ASK.blind.test(text)) topics.push("blind");
  if (CUSTOMER_ASK.maintenance.test(text)) topics.push("maintenance");
  return topics;
}

function customerAskedReliability(customer: string): boolean {
  return /引擎|維修|故障|耐用|零件.*價|換零件/.test(customer);
}

function customerAskedMethodology(customer: string): boolean {
  return /怎麼估|如何計|試算表|成本結構|邏輯|細節|基礎試算|評估數據/.test(customer);
}

/** 消極、推遲、或過度敷衍的業代回覆（不算已回答） */
export function isWeakAgentReply(agent: string): boolean {
  const t = agent.trim();
  if (/^我?不清楚|不知道|不確定|沒研究|沒辦法|不太清楚|不太懂|不清楚耶/i.test(t)) {
    return true;
  }
  if (t.length < 28 && /不清楚|不知道|不確定/.test(t)) return true;
  if (/試乘時才|到時候再|試乘再給|一併給你?\s*\??$/i.test(t) && !hasConcreteNumbers(t)) {
    return true;
  }
  if (/快點約|趕快約|快點.*試乘|約試乘拉/i.test(t)) return true;
  if (/試乘時.*表格|表格.*試乘/i.test(t) && !/加總|折扣|稅金|油資|WLTC|km/.test(t)) {
    return true;
  }
  return false;
}

function agentExplainsMethodology(agent: string): boolean {
  if (isWeakAgentReply(agent)) return false;
  return (
    hasConcreteNumbers(agent) &&
    /加總|折扣|稅金|油資|車價|電池|WLTC|年里程|試算|10年|10萬|萬公里/.test(agent)
  );
}

/** 客戶問 WLTC／路況，業代改以十年成本項目說明，視為有回應意圖 */
function agentCoversWltcWithCostBreakdown(agent: string, customer: string): boolean {
  if (!/WLTC|測試路況|路況.*比例|測試條件/.test(customer)) return false;
  if (isWeakAgentReply(agent)) return false;
  return /加總|試算|車價|折扣|稅金|油資|電池|持有成本|十年|10年/.test(agent);
}

function agentCoversTopic(agent: string, topic: TopicKind, customerContext?: string): boolean {
  if (isWeakAgentReply(agent)) return false;
  if (
    customerContext &&
    topic === "fuel" &&
    agentCoversWltcWithCostBreakdown(agent, customerContext)
  ) {
    return true;
  }
  if (customerContext && customerAskedMethodology(customerContext)) {
    return agentExplainsMethodology(agent);
  }
  if (AGENT_TOPIC_COVERED[topic].test(agent)) return true;
  if (topic === "maintenance" && customerContext && customerAskedReliability(customerContext)) {
    return /引擎|維修|故障|耐用|CVT|變速箱|保固|零件/.test(agent);
  }
  if (topic === "maintenance" || topic === "fuel") {
    if (LOOSE_COST_COVERED.test(agent) && (hasConcreteNumbers(agent) || /加總|試算|折扣|稅金|油資/.test(agent))) {
      return true;
    }
  }
  return false;
}

/** 僅看「本輪客戶發問之前」業代是否已充分回過此議題（不因後續輪次補答而略過當輪） */
function earlierSessionCoversTopic(
  turns: RoleplayChatTurn[],
  customerIndex: number,
  topic: TopicKind,
  customerContext: string,
): boolean {
  const needsReliability = customerAskedReliability(customerContext);
  const needsMethod = customerAskedMethodology(customerContext);
  for (let j = 0; j < customerIndex - 1; j++) {
    const c = turns[j]!;
    const a = turns[j + 1]!;
    if (c.role !== "customer" || a.role !== "agent") continue;
    if (!customerTopics(c.content).includes(topic)) continue;
    if (needsReliability && topic === "maintenance" && !customerAskedReliability(c.content)) {
      continue;
    }
    if (needsMethod && !customerAskedMethodology(c.content)) {
      continue;
    }
    if (agentCoversTopic(a.content, topic, c.content)) return true;
  }
  return false;
}

function customerWantsExplanation(customer: string): boolean {
  return (
    customerAskedMethodology(customer) ||
    /具體|結構|邏輯|專業|細節|數據|參考|釐清|講.*清楚/.test(customer)
  );
}

function detectPerRoundStrategy(customer: string, agent: string): CorrectionCandidate | null {
  if (!isSubstantiveCustomerLine(customer) || isOpeningGreeting(agent)) return null;

  const wants = customerWantsExplanation(customer);
  const upset = /沒信心|不敢相信|拖延|迴避|怎麼敢|沒辦法參考|服務品質/.test(customer);

  if (/快點約|趕快約|快點.*試乘|約試乘拉/i.test(agent)) {
    return {
      issue: STRATEGY_RUDE_ISSUE,
      category: "strategy",
      whatYouSaid: agent.slice(0, 120),
      customerAsk: customer.slice(0, 150),
      topic: "advance",
    };
  }

  if (
    (wants || upset) &&
    (/試乘時|到時候再|試乘再|一併給/i.test(agent) ||
      (/試乘|試駕|預約/.test(agent) && !agentExplainsMethodology(agent)))
  ) {
    return {
      issue: STRATEGY_DEFER_ISSUE,
      category: "strategy",
      whatYouSaid: agent.slice(0, 120),
      customerAsk: customer.slice(0, 150),
      topic: "advance",
    };
  }

  if (isWeakAgentReply(agent) && (wants || upset) && /試乘|試駕|預約|表格/.test(agent)) {
    return {
      issue: STRATEGY_DEFER_ISSUE,
      category: "strategy",
      whatYouSaid: agent.slice(0, 120),
      customerAsk: customer.slice(0, 150),
      topic: "advance",
    };
  }

  return null;
}

function wrongTopicResponse(
  customer: string,
  agent: string,
  asked: TopicKind,
): TopicKind | null {
  for (const t of Object.keys(TOPIC_PATTERNS) as TopicKind[]) {
    if (t === asked) continue;
    if (agentCoversTopic(agent, t, customer) && !agentCoversTopic(agent, asked, customer)) {
      if (CUSTOMER_ASK[asked].test(customer)) return t;
    }
  }
  return null;
}

/** 僅在「客戶有問 → 該輪／全場仍不足」時產生候選 */
export function detectCorrectionCandidates(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): CorrectionCandidate[] {
  const pairedTurns = coalesceAdjacentAgentTurns(turns);
  const out: CorrectionCandidate[] = [];
  const seen = new Set<string>();

  const add = (c: CorrectionCandidate) => {
    const key = `${c.category}:${c.issue.slice(0, 24)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };

  for (let i = 0; i < pairedTurns.length - 1; i++) {
    const cur = pairedTurns[i]!;
    const next = pairedTurns[i + 1]!;
    if (cur.role !== "customer" || next.role !== "agent") continue;
    if (!isSubstantiveCustomerLine(cur.content)) continue;

    const c = cur.content;
    const a = next.content;
    if (isOpeningGreeting(a)) continue;

    const topics = customerTopics(c);
    if (topics.length === 0 && (customerWantsExplanation(c) || isWeakAgentReply(a))) {
      topics.push("fuel");
    }

    for (const topic of topics) {
      if (agentCoversTopic(a, topic, c)) continue;
      if (earlierSessionCoversTopic(pairedTurns, i, topic, c)) continue;

      const wrong = wrongTopicResponse(c, a, topic);
      const issue = wrong
        ? `${ISSUE_LABEL[topic]}（該輪回答了其他面向）`
        : isWeakAgentReply(a) && customerAskedMethodology(c)
          ? "客戶問試算邏輯，該輪回覆不清楚或無法說明"
          : ISSUE_LABEL[topic];

      add({
        issue,
        category: "fact",
        whatYouSaid: a.slice(0, 120),
        customerAsk: c.slice(0, 150),
        topic,
      });
    }

    const strategyGap = detectPerRoundStrategy(c, a);
    if (strategyGap) add(strategyGap);
  }

  const agentTexts = pairedTurns.filter((t) => t.role === "agent").map((t) => t.content);
  const lastCustomer = [...pairedTurns].reverse().find((t) => t.role === "customer");
  const lastAgent = agentTexts.at(-1) ?? "";
  const hadGoodInvite = pairedTurns
    .filter((t) => t.role === "agent")
    .some((t) => SESSION_ADVANCE.test(t.content) && !isWeakAgentReply(t.content));

  if (
    lastCustomer &&
    isSubstantiveCustomerLine(lastCustomer.content) &&
    agentTexts.length >= 2 &&
    !hadGoodInvite &&
    !detectPerRoundStrategy(lastCustomer.content, lastAgent)
  ) {
    add({
      issue: "收尾可更具體邀約試乘或試算",
      category: "strategy",
      whatYouSaid: lastAgent.slice(0, 100),
      customerAsk: lastCustomer.content.slice(0, 150),
      topic: "advance",
    });
  }

  return out.slice(0, 5);
}

export function isGarbageIssue(issue: string): boolean {
  const t = issue.trim();
  if (t.length < 6) return true;
  if (/^(重點\s*\d|舊世代|DLR|興趣車|Do not use)/i.test(t)) return true;
  if (/開場未先同理/.test(t)) return true;
  return false;
}

export function isRawRagDump(guide: string): boolean {
  const t = guide.trim();
  return (
    /不買.*三大理由|車價\s*122|X.TRAIL\s*旗艦.*RAV4|請對照銷售助手/.test(t) ||
    (t.match(/・/g)?.length ?? 0) > 4 ||
    t.length > 320
  );
}

function ragSnippetForTopic(scenario: RoleplayScenario, topic: TopicKind | "advance"): string {
  if (topic === "advance") {
    return scenario.sectionD.closingActions.join("、") || "邀請試乘、提供試算表";
  }
  const fact = bestFactForTopic(scenario, topic);
  if (!fact) return "";
  const points = extractTalkingPoints(fact.value, topic);
  return points.length > 0 ? points.join("；") : cleanFactExcerpt(fact.value).slice(0, 200);
}

async function synthesizeGuidesFromRag(
  scenario: RoleplayScenario,
  candidates: CorrectionCandidate[],
): Promise<RoleplayCorrectionPoint[]> {
  if (candidates.length === 0) return [];

  const factsBlock = scenario.sectionC.facts
    .slice(0, 8)
    .map((f) => `- ${f.label}：${cleanFactExcerpt(f.value).slice(0, 200)}`)
    .join("\n");

  const items = candidates.map((c) => ({
    issue: c.issue,
    category: c.category,
    customerAsk: c.customerAsk,
    whatYouSaid: c.whatYouSaid,
    ragHint: c.topic === "advance" ? ragSnippetForTopic(scenario, "advance") : ragSnippetForTopic(scenario, c.topic as TopicKind),
  }));

  const prompt = `你是汽車銷售教練。依「客戶問題」與「教材摘要」，撰寫業代建議說法（correctGuide）。
重要：
- correctGuide 必須含【至少 2 個阿拉伯數字】（如 km/L、萬元、分貝、年里程），2～3 句口語、業代可直接對客戶講
- 禁止「依教材」「請參考 RAG」「針對客戶問題」等空話；禁止省略號結尾
- 不是修飾業代原話；是「若重答此題，應帶哪些數字怎麼說」
- 禁止貼 PDF 原文、bullet 超過 3 點、檔名
- issue、category、customerAsk、whatYouSaid 逐字保留

【教材摘要】
${factsBlock}

【待撰寫項目】
${JSON.stringify(items, null, 2)}

輸出 JSON 陣列，長度與輸入相同：
[{"issue":"同輸入","category":"fact或strategy","customerAsk":"同輸入","whatYouSaid":"同輸入","correctGuide":"依教材整理 2-3 句"}]`;

  const raw = await geminiGenerateText(prompt, {
    json: true,
    maxOutputTokens: 1200,
    temperature: 0.25,
  });

  const fallback = (c: CorrectionCandidate): RoleplayCorrectionPoint => {
    const topic = c.topic === "advance" ? "advance" : (c.topic as TopicKind);
    const concrete = buildConcreteCorrectGuide(scenario, topic, c.customerAsk);
    const snippet = ragSnippetForTopic(scenario, topic as TopicKind | "advance");
    const guide =
      concrete ||
      (hasConcreteNumbers(snippet)
        ? snippet.slice(0, 200)
        : buildConcreteCorrectGuide(scenario, "fuel", c.customerAsk));
    return {
      issue: c.issue,
      category: c.category,
      customerAsk: c.customerAsk || undefined,
      whatYouSaid: c.whatYouSaid || undefined,
      correctGuide: guide || "請查閱本場教材中的試算數字後再向客戶說明。",
    };
  };

  if (!raw) return candidates.map(fallback);

  try {
    const parsed = JSON.parse(raw) as Partial<RoleplayCorrectionPoint>[];
    if (!Array.isArray(parsed) || parsed.length !== candidates.length) {
      return candidates.map(fallback);
    }

    return candidates.map((c, i) => {
      const row = parsed[i] ?? {};
      const guide = String(row.correctGuide ?? "").trim();
      const point = normalizeCorrectionPoint({
        issue: String(row.issue ?? c.issue).trim(),
        category: (row.category as RoleplayCorrectionCategory) ?? c.category,
        customerAsk: String(row.customerAsk ?? c.customerAsk).trim() || undefined,
        whatYouSaid: String(row.whatYouSaid ?? c.whatYouSaid).trim() || undefined,
        correctGuide:
          guide.length >= 16 &&
          !isRawRagDump(guide) &&
          !isVagueCorrectGuide(guide) &&
          (c.category === "strategy" || hasConcreteNumbers(guide))
            ? guide
            : fallback(c).correctGuide,
      });
      return point;
    });
  } catch {
    return candidates.map(fallback);
  }
}

export async function buildSessionCorrections(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): Promise<RoleplayCorrectionPoint[]> {
  const candidates = detectCorrectionCandidates(scenario, turns);
  if (candidates.length === 0) return [];

  const points = await synthesizeGuidesFromRag(scenario, candidates);
  return points
    .filter(
      (p) =>
        !isGarbageIssue(p.issue) &&
        !isRawRagDump(p.correctGuide) &&
        !isVagueCorrectGuide(p.correctGuide),
    )
    .slice(0, 5);
}

/** 從 BQ transcript 重算待加強（歷史紀錄補齊用） */
export async function rebuildCorrectionsFromTranscript(input: {
  transcript: string;
  competitor: string;
  targetModel: string;
  difficulty: string;
  ageRange: string;
  facts?: { label: string; value: string }[];
}): Promise<RoleplayCorrectionPoint[]> {
  const { parseRoleplayTranscriptLines } = await import("@/lib/bq/roleplay-sessions-bq");
  const lines = parseRoleplayTranscriptLines(input.transcript);
  const turns = coalesceAdjacentAgentTurns(
    lines.map((l) => ({
      role: l.role,
      content: l.content,
      at: l.at || new Date().toISOString(),
    })),
  );
  if (turns.length < 2) return [];

  const scenario = {
    scenarioId: "rebuild-from-transcript",
    sectionA: {
      title: "對練情境",
      coreIssue: "購車與持有成本",
      competitor: input.competitor,
      productDisplayName: input.targetModel,
      productLine: "xtrail-ice",
    },
    sectionB: { openingLine: "", followUps: [] },
    sectionC: {
      facts:
        input.facts && input.facts.length > 0
          ? input.facts
          : [{ label: "教材", value: "請依本場競品比較資料回應客戶。" }],
    },
    sectionD: { keyPoints: [], forbidden: [], closingActions: ["邀請試乘", "提供試算表"] },
    sectionE: {
      difficulty: input.difficulty as RoleplayDifficulty,
      maxTurns: 5,
      personaId: "P-01",
      ageRange: input.ageRange as RoleplayAgeRange,
    },
    sectionF: { criteria: [] },
  } satisfies RoleplayScenario;

  return buildSessionCorrections(scenario, turns);
}
