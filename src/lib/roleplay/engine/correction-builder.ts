import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import type { RoleplayAgeRange, RoleplayDifficulty } from "@/lib/roleplay/scenario-contract";
import {
  answerTargetsWrongCompetitor,
  buildConcreteCorrectGuide,
  customerCorrectedCompetitor,
  filterFactsForSession,
  getOtherCompetitorMentions,
  hasConcreteNumbers,
  isVagueCorrectGuide,
  isWrongCompetitorInGuide,
  mentionsSessionCompetitor,
  normalizeCompetitorToken,
} from "@/lib/roleplay/engine/correction-guide";
import {
  buildCorrectionsViaRubricReview,
  dedupeCorrectionPoints,
  parseLlmJsonResponse,
} from "@/lib/roleplay/engine/correction-rubric-review";
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
  topic: TopicKind | "advance" | "competitor";
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
  maintenance: /保養|回廠|零件|保修|定保|維修|引擎|故障|耐用|維護|高里程|兩萬公里|2萬公里|妥善率|回廠一次/,
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
const STRATEGY_LINE_DEFER_ISSUE = "客戶要求當場說明試算，該輪只延後到 LINE／內部確認";
const STRATEGY_RUDE_ISSUE = "邀約語氣過於敷衍，未先回應客戶疑慮";

export const AGENT_DEFER_PATTERNS =
  /LINE|內部確認|另外回給|找.*資料.*回|稍後.*提供|回給您|再回給/i;

/** 業代延後到 LINE／內部確認／試乘才給表，且未當場說明數字（客戶 AI 與待加強共用） */
export function isAgentStrategyDeferReply(agent: string): boolean {
  const t = agent.trim();
  if (AGENT_DEFER_PATTERNS.test(t) && !hasMethodologyExplanation(t)) return true;
  if (
    /試乘時才|到時候再|試乘再給|試乘.*才給|約試乘.*才|試乘.*表格|表格.*試乘/i.test(t) &&
    !hasMethodologyExplanation(t)
  ) {
    return true;
  }
  return false;
}

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
  customerAsk?: string,
): { label: string; value: string } | null {
  const facts = filterFactsForSession(
    scenario.sectionC.facts,
    scenario.sectionA.competitor,
    customerAsk,
  );
  if (facts.length === 0) return scenario.sectionC.facts[0] ?? null;

  let best: { label: string; value: string } | null = null;
  let bestScore = 0;
  for (const f of facts) {
    const score = extractTalkingPoints(f.value, topic).length;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return bestScore > 0 ? best : facts[0] ?? null;
}

function isSubstantiveCustomerLine(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (/^(好的|了解|嗯|謝謝|再考慮)/.test(t)) return false;
  return true;
}

export function isOpeningGreeting(text: string): boolean {
  const t = text.trim();
  if (t.length >= 120) return false;
  if (/^(你好|您好|嗨)[，,！!]?/.test(t) && t.length <= 36) return true;
  if (!/您好|你好|歡迎|在看這台|有什麼問題|有什麼需要|需要為您|都可以為您說明|都可以問我/.test(t)) {
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
  return /怎麼估|如何計|試算表|成本結構|邏輯|細節|基礎試算|評估數據|怎麼算|不太踏實|詳細.*試算/.test(
    customer,
  );
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
  if (AGENT_DEFER_PATTERNS.test(t) && !hasMethodologyExplanation(t)) {
    return true;
  }
  return false;
}

function hasMethodologyExplanation(agent: string): boolean {
  return (
    hasConcreteNumbers(agent) &&
    /加總|折扣|稅金|油資|車價|電池|WLTC|年里程|試算|10年|10萬|萬公里/.test(agent)
  );
}

function agentExplainsMethodology(agent: string): boolean {
  if (isWeakAgentReply(agent)) return false;
  return hasMethodologyExplanation(agent);
}

/** 客戶問 WLTC／路況，業代改以十年成本項目說明，視為有回應意圖 */
function agentCoversWltcWithCostBreakdown(agent: string, customer: string): boolean {
  if (!/WLTC|測試路況|路況.*比例|測試條件/.test(customer)) return false;
  if (isWeakAgentReply(agent)) return false;
  return /加總|試算|車價|折扣|稅金|油資|電池|持有成本|十年|10年/.test(agent);
}

function agentCoversTopic(
  agent: string,
  topic: TopicKind,
  customerContext?: string,
  sessionCompetitor?: string,
): boolean {
  if (isWeakAgentReply(agent)) return false;
  if (
    sessionCompetitor &&
    customerContext &&
    answerTargetsWrongCompetitor(agent, sessionCompetitor, customerContext)
  ) {
    return false;
  }
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
  sessionCompetitor: string,
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
    if (answerTargetsWrongCompetitor(a.content, sessionCompetitor, c.content)) {
      continue;
    }
    if (agentCoversTopic(a.content, topic, c.content, sessionCompetitor)) return true;
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
  const upset = /沒信心|不敢相信|拖延|迴避|怎麼敢|沒辦法參考|服務品質|困擾|模糊/.test(customer);

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

  if (
    (wants || customerAskedMethodology(customer)) &&
    AGENT_DEFER_PATTERNS.test(agent) &&
    !agentExplainsMethodology(agent)
  ) {
    return {
      issue: STRATEGY_LINE_DEFER_ISSUE,
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
  sessionCompetitor: string,
): TopicKind | null {
  for (const t of Object.keys(TOPIC_PATTERNS) as TopicKind[]) {
    if (t === asked) continue;
    if (
      agentCoversTopic(agent, t, customer, sessionCompetitor) &&
      !agentCoversTopic(agent, asked, customer, sessionCompetitor)
    ) {
      if (CUSTOMER_ASK[asked].test(customer)) return t;
    }
  }
  return null;
}

/** 偵測業代比錯車款或客戶已指正競品不符 */
function detectCompetitorAlignmentGaps(
  scenario: RoleplayScenario,
  pairedTurns: RoleplayChatTurn[],
): CorrectionCandidate[] {
  const sessionComp = scenario.sectionA.competitor;
  const shortComp = normalizeCompetitorToken(sessionComp);
  const issue = `回答對象車款與本場競品不符（客戶要比較 ${shortComp}）`;

  for (let i = 0; i < pairedTurns.length; i++) {
    const cur = pairedTurns[i]!;
    if (cur.role !== "customer" || !isSubstantiveCustomerLine(cur.content)) continue;
    if (!customerCorrectedCompetitor(cur.content)) continue;

    let wrongAgent = "";
    for (let j = i - 1; j >= 0; j--) {
      const prev = pairedTurns[j]!;
      if (prev.role === "agent") {
        wrongAgent = prev.content;
        break;
      }
    }

    return [
      {
        issue,
        category: "fact",
        whatYouSaid: wrongAgent.slice(0, 120),
        customerAsk: cur.content.slice(0, 150),
        topic: "competitor",
      },
    ];
  }

  for (let i = 0; i < pairedTurns.length - 1; i++) {
    const c = pairedTurns[i]!;
    const a = pairedTurns[i + 1]!;
    if (c.role !== "customer" || a.role !== "agent") continue;
    if (!isSubstantiveCustomerLine(c.content)) continue;
    const customerNamesSession =
      mentionsSessionCompetitor(c.content, sessionComp) ||
      getOtherCompetitorMentions(c.content, sessionComp).length === 0;
    if (!customerNamesSession) continue;
    if (answerTargetsWrongCompetitor(a.content, sessionComp, c.content)) {
      return [
        {
          issue,
          category: "fact",
          whatYouSaid: a.content.slice(0, 120),
          customerAsk: c.content.slice(0, 150),
          topic: "competitor",
        },
      ];
    }
  }

  for (const t of pairedTurns) {
    if (t.role !== "agent") continue;
    const others = getOtherCompetitorMentions(t.content, sessionComp);
    if (others.length > 0 && !mentionsSessionCompetitor(t.content, sessionComp)) {
      const prevCustomer = pairedTurns
        .slice(0, pairedTurns.indexOf(t))
        .reverse()
        .find((x) => x.role === "customer");
      return [
        {
          issue,
          category: "fact",
          whatYouSaid: t.content.slice(0, 120),
          customerAsk: (prevCustomer?.content ?? "").slice(0, 150),
          topic: "competitor",
        },
      ];
    }
  }

  return [];
}

/** 僅在「客戶有問 → 該輪／全場仍不足」時產生候選 */
export function detectCorrectionCandidates(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): CorrectionCandidate[] {
  const pairedTurns = coalesceAdjacentAgentTurns(turns);
  const sessionComp = scenario.sectionA.competitor;
  const out: CorrectionCandidate[] = [];
  const seen = new Set<string>();

  const add = (c: CorrectionCandidate, front = false) => {
    const key = `${c.category}:${c.issue.slice(0, 24)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (front) out.unshift(c);
    else out.push(c);
  };

  for (const gap of detectCompetitorAlignmentGaps(scenario, pairedTurns)) {
    add(gap, true);
  }

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

    const wrongCompetitorThisRound = answerTargetsWrongCompetitor(a, sessionComp, c);

    let roundAdded = false;
    for (const topic of topics) {
      if (wrongCompetitorThisRound && topic !== "maintenance") continue;
      if (wrongCompetitorThisRound && topic === "maintenance") {
        add({
          issue: `客戶問保養／回廠，該輪卻以其他競品數據回應（應對準 ${normalizeCompetitorToken(sessionComp)}）`,
          category: "fact",
          whatYouSaid: a.slice(0, 120),
          customerAsk: c.slice(0, 150),
          topic: "competitor",
        });
        roundAdded = true;
        continue;
      }
      if (agentCoversTopic(a, topic, c, sessionComp)) continue;
      if (earlierSessionCoversTopic(pairedTurns, i, topic, c, sessionComp)) continue;

      const wrong = wrongTopicResponse(c, a, topic, sessionComp);
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
      roundAdded = true;
    }

    const strategyGap = detectPerRoundStrategy(c, a);
    if (strategyGap) {
      add(strategyGap);
      roundAdded = true;
    }

    if (!roundAdded && isWeakAgentReply(a)) {
      add({
        issue: "客戶提問該輪回覆過於空泛或未正面回答",
        category: "fact",
        whatYouSaid: a.slice(0, 120),
        customerAsk: c.slice(0, 150),
        topic: topics[0] ?? "fuel",
      });
    }
  }

  const agentTexts = pairedTurns.filter((t) => t.role === "agent").map((t) => t.content);
  const lastCustomer = [...pairedTurns].reverse().find((t) => t.role === "customer");
  const lastAgent = agentTexts.at(-1) ?? "";
  const hadGoodInvite = pairedTurns
    .filter((t) => t.role === "agent")
    .some((t) => SESSION_ADVANCE.test(t.content) && !isWeakAgentReply(t.content));

  const customerEndingNegatively = lastCustomer
    ? /先了解到|會再研究|有需要再找|避重就輕|很難.*信心|跳開|今天先/.test(
        lastCustomer.content,
      )
    : false;

  if (
    lastCustomer &&
    isSubstantiveCustomerLine(lastCustomer.content) &&
    agentTexts.length >= 2 &&
    !hadGoodInvite &&
    !customerEndingNegatively &&
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

export function isTypoRelatedIssue(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /錯字|錯別字|打字錯|打錯字|筆誤|同音錯|誤植|typo|錯打|用字不當|語句不通順|錯字連連|錯字較多|文字錯誤|表述不清.*錯字/.test(
    t,
  );
}

export function isGarbageIssue(issue: string): boolean {
  const t = issue.trim();
  if (t.length < 6) return true;
  if (isTypoRelatedIssue(t)) return true;
  if (/^(重點\s*\d|舊世代|DLR|興趣車|Do not use)/i.test(t)) return true;
  if (/開場未先同理/.test(t)) return true;
  return false;
}

export function isRawRagDump(guide: string): boolean {
  const t = guide.trim();
  return (
    /重點\s*\d|舊世代\s*HEV|vs\.\s*重點|不買.*三大理由|車價\s*122|X.TRAIL\s*旗艦.*RAV4|請對照銷售助手/.test(
      t,
    ) ||
    (t.match(/・/g)?.length ?? 0) > 4 ||
    t.length > 320
  );
}

function ragSnippetForTopic(
  scenario: RoleplayScenario,
  topic: TopicKind | "advance" | "competitor",
  customerAsk?: string,
): string {
  if (topic === "advance") {
    return scenario.sectionD.closingActions.join("、") || "邀請試乘、提供試算表";
  }
  if (topic === "competitor") {
    return buildConcreteCorrectGuide(scenario, "competitor", customerAsk);
  }
  const fact = bestFactForTopic(scenario, topic, customerAsk);
  if (!fact) return "";
  const points = extractTalkingPoints(fact.value, topic);
  return points.length > 0 ? points.join("；") : cleanFactExcerpt(fact.value).slice(0, 200);
}

async function synthesizeGuidesFromRag(
  scenario: RoleplayScenario,
  candidates: CorrectionCandidate[],
): Promise<RoleplayCorrectionPoint[]> {
  if (candidates.length === 0) return [];

  const sessionComp = scenario.sectionA.competitor;
  const filteredFacts = filterFactsForSession(scenario.sectionC.facts, sessionComp);
  const factsBlock = filteredFacts
    .slice(0, 8)
    .map((f) => `- ${f.label}：${cleanFactExcerpt(f.value).slice(0, 200)}`)
    .join("\n");

  const items = candidates.map((c) => ({
    issue: c.issue,
    category: c.category,
    customerAsk: c.customerAsk,
    whatYouSaid: c.whatYouSaid,
    ragHint:
      c.topic === "advance"
        ? ragSnippetForTopic(scenario, "advance")
        : ragSnippetForTopic(scenario, c.topic, c.customerAsk),
  }));

  const shortComp = normalizeCompetitorToken(sessionComp);
  const product = scenario.sectionA.productDisplayName || "X-TRAIL";

  const prompt = `你是汽車銷售教練。依「客戶問題」與「教材摘要」，撰寫業代建議說法（correctGuide）。

【本場對話設定 — 系統已指定】
- 我方車款：${product}
- 目標競品（全名）：${sessionComp}
- 目標競品簡稱（shortComp）：${shortComp}

重要：
- correctGuide 必須針對 ${shortComp}；禁止出現其他競品車名（除非客戶問題有提到）
- 嚴禁主觀建議（語氣、熱情、禮貌）；僅補足事實或策略失誤
- correctGuide 必須含【至少 2 個阿拉伯數字】，2～3 句台灣業代口語（用「保養、規格配備、CP值、交車、回廠定保」；禁「售後、配置、性價比、提車、保養週期」）
- 禁止「依教材」「請參考 RAG」等空話；禁止貼 PDF 原文
- issue、category、customerAsk、whatYouSaid 逐字保留

【教材摘要】
${factsBlock}

【待撰寫項目】
${JSON.stringify(items, null, 2)}

請直接輸出 JSON 陣列（無 Markdown、無前言），長度與輸入相同：
[{"issue":"同輸入","category":"fact或strategy","customerAsk":"同輸入","whatYouSaid":"同輸入","correctGuide":"2-3 句"}]`;

  const raw = await geminiGenerateText(prompt, {
    json: true,
    maxOutputTokens: 1200,
    temperature: 0.25,
  });

  const pickGuide = (c: CorrectionCandidate): string => {
    if (/比錯|競品不符|車款|一直拿|其他競品/.test(c.issue)) {
      return buildConcreteCorrectGuide(scenario, "competitor", c.customerAsk);
    }
    if (c.category === "strategy" && /LINE|延後|試算|當場/.test(c.issue)) {
      const g = buildConcreteCorrectGuide(scenario, "fuel", c.customerAsk);
      if (g) return g;
    }
    const topic =
      c.topic === "advance" || c.topic === "competitor"
        ? c.topic
        : (c.topic as TopicKind);
    const concrete = buildConcreteCorrectGuide(scenario, topic, c.customerAsk);
    const snippet = ragSnippetForTopic(scenario, topic, c.customerAsk);
    let guide =
      concrete ||
      (hasConcreteNumbers(snippet)
        ? snippet.slice(0, 200)
        : buildConcreteCorrectGuide(scenario, "fuel", c.customerAsk));
    if (isWrongCompetitorInGuide(guide, sessionComp, c.customerAsk)) {
      guide = buildConcreteCorrectGuide(scenario, c.topic === "competitor" ? "competitor" : "fuel", c.customerAsk);
    }
    return guide || "請查閱本場教材中的試算數字後再向客戶說明。";
  };

  const fallback = (c: CorrectionCandidate): RoleplayCorrectionPoint => ({
    issue: c.issue,
    category: c.category,
    customerAsk: c.customerAsk || undefined,
    whatYouSaid: c.whatYouSaid || undefined,
    correctGuide: pickGuide(c),
  });

  if (!raw) return candidates.map(fallback);

  try {
    const parsed = parseLlmJsonResponse(raw) as Partial<RoleplayCorrectionPoint>[];
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
          !isWrongCompetitorInGuide(guide, sessionComp, c.customerAsk) &&
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

function rubricPointVerifiedInTranscript(
  p: RoleplayCorrectionPoint,
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): boolean {
  const sessionComp = scenario.sectionA.competitor;
  const paired = coalesceAdjacentAgentTurns(turns);
  for (let i = 0; i < paired.length - 1; i++) {
    const c = paired[i]!;
    const a = paired[i + 1]!;
    if (c.role !== "customer" || a.role !== "agent") continue;
    if (isOpeningGreeting(a.content)) continue;

    if (/比錯|一直拿|跳開|未對準|車款/.test(p.issue)) {
      if (
        customerCorrectedCompetitor(c.content) ||
        answerTargetsWrongCompetitor(a.content, sessionComp, c.content)
      ) {
        return true;
      }
    }
    if (/LINE|延後|過度依賴|拒絕提供|策略/.test(p.issue)) {
      if (detectPerRoundStrategy(c.content, a.content)) return true;
    }
    if (/避重就輕|重複話術/.test(p.issue)) {
      if (
        customerCorrectedCompetitor(c.content) ||
        /避重就輕|跳開|很難.*信心/.test(c.content)
      ) {
        return true;
      }
    }
    if (/保養|回廠|高里程|妥善|持有成本|成本數據/.test(p.issue + (p.customerAsk ?? ""))) {
      const topics: TopicKind[] = [];
      if (CUSTOMER_ASK.maintenance.test(c.content)) topics.push("maintenance");
      if (CUSTOMER_ASK.fuel.test(c.content)) topics.push("fuel");
      for (const topic of topics) {
        if (answerTargetsWrongCompetitor(a.content, sessionComp, c.content)) return true;
        if (agentCoversTopic(a.content, topic, c.content, sessionComp)) continue;
        if (earlierSessionCoversTopic(paired, i, topic, c.content, sessionComp)) continue;
        return true;
      }
    }
  }
  return false;
}

function filterRubricFalsePositives(
  points: RoleplayCorrectionPoint[],
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
  ruleGapCount: number,
): RoleplayCorrectionPoint[] {
  if (ruleGapCount > 0 || points.length === 0) return points;
  return points.filter((p) => rubricPointVerifiedInTranscript(p, scenario, turns));
}

function filterValidCorrectionPoints(
  points: RoleplayCorrectionPoint[],
  relaxed = false,
): RoleplayCorrectionPoint[] {
  return dedupeCorrectionPoints(
    points.filter(
      (p) =>
        !isGarbageIssue(p.issue) &&
        !isRawRagDump(p.correctGuide) &&
        (relaxed || !isVagueCorrectGuide(p.correctGuide)) &&
        p.issue.length >= 4 &&
        p.correctGuide.length >= 12,
    ),
  );
}

function buildLocalFallbackCorrections(
  scenario: RoleplayScenario,
  candidates: CorrectionCandidate[],
): RoleplayCorrectionPoint[] {
  const sessionComp = scenario.sectionA.competitor;
  const shortComp = normalizeCompetitorToken(sessionComp);
  const product = scenario.sectionA.productDisplayName || "X-TRAIL";

  return candidates.slice(0, 5).map((c) => {
    const topic =
      c.topic === "advance" || c.topic === "competitor"
        ? c.topic
        : (c.topic as TopicKind);
    const guide =
      buildConcreteCorrectGuide(scenario, topic, c.customerAsk) ||
      `客戶問到重點時，請用教材試算（十年 10 萬公里、WLTC 油耗 km/L）對照 ${shortComp} 與 ${product} 具體說明，勿以「不清楚」帶過。`;
    return {
      issue: c.issue,
      category: c.category,
      customerAsk: c.customerAsk || undefined,
      whatYouSaid: c.whatYouSaid || undefined,
      correctGuide: guide,
    };
  });
}

export async function buildSessionCorrections(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): Promise<RoleplayCorrectionPoint[]> {
  const ruleCandidates = detectCorrectionCandidates(scenario, turns);
  const rubricPoints = filterRubricFalsePositives(
    await buildCorrectionsViaRubricReview(scenario, turns),
    scenario,
    turns,
    ruleCandidates.length,
  );

  // 規則偵測到的缺口必須出現在待加強（不依賴 Gemini 是否回傳空陣列）
  let rulePoints: RoleplayCorrectionPoint[] = [];
  if (ruleCandidates.length > 0) {
    rulePoints = await synthesizeGuidesFromRag(scenario, ruleCandidates);
  }

  const merged = filterValidCorrectionPoints([...rubricPoints, ...rulePoints]);
  if (merged.length > 0) return merged.slice(0, 5);

  if (ruleCandidates.length > 0) {
    const local = filterValidCorrectionPoints(
      buildLocalFallbackCorrections(scenario, ruleCandidates),
      true,
    );
    if (local.length > 0) return local;
  }

  return filterValidCorrectionPoints(rubricPoints).slice(0, 5);
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
