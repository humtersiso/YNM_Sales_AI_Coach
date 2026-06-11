import {
  detectCorrectionCandidates,
  isAgentStrategyDeferReply,
  isOpeningGreeting,
  isWeakAgentReply,
} from "@/lib/roleplay/engine/correction-builder";
import { hasConcreteNumbers } from "@/lib/roleplay/engine/correction-guide";
import { coalesceAdjacentAgentTurns } from "@/lib/roleplay/engine/turn-coalesce";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import { ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";
import type { RoleplayChatTurn, RoleplayDimensionScore } from "@/lib/roleplay/session-types";

const DIMENSION_MAX = 20;

function clampDimension(n: number): number {
  return Math.min(DIMENSION_MAX, Math.max(0, Math.round(n)));
}

/** 消極、敷衍、極短或明顯亂答（評分用；不含打字錯字） */
export function isLowQualityAgentReply(agent: string): boolean {
  const t = agent.trim();
  if (!t) return true;
  if (isOpeningGreeting(t)) return false;
  if (isWeakAgentReply(t)) return true;
  if (t.length < 12) return true;
  if (
    /不知道|不確定|不太清楚|沒研究|沒辦法|不清楚|不太懂|沒有資料|隨便|再看看|應該吧|大概吧|差不多吧|問主管|回去查|晚點再說|管他|無所謂|都可以|哈哈哈|哈哈|測試|亂講|亂說|敷衍|隨便講|隨便說|不知道耶|不曉得/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    t.length < 22 &&
    !/\d|WLTC|試算|試乘|隔音|油耗|km|萬|配備|功能|加總|折扣/.test(t) &&
    !/您好|你好|歡迎|請問|想了解|有在比|有在看|很高興|感謝|協助|說明/.test(t)
  ) {
    return true;
  }
  return false;
}

/** 含具體數字且回應成本／產品事實的業代輪次（不含開場招呼） */
export function countStrongFactualRounds(turns: RoleplayChatTurn[]): number {
  return coalesceAdjacentAgentTurns(turns).filter((t) => {
    if (t.role !== "agent" || isOpeningGreeting(t.content)) return false;
    const a = t.content;
    return (
      !isLowQualityAgentReply(a) &&
      hasConcreteNumbers(a) &&
      /萬|試算|持有成本|稅金|折扣|油耗|WLTC|分貝|定保|油資|十年|10年|電池|加總/.test(a)
    );
  }).length;
}

export function strongFactualRatio(strongCount: number, maxTurns: number): number {
  return strongCount / Math.max(1, maxTurns);
}

export function strongFactualTier(
  strongCount: number,
  maxTurns: number,
): 0 | 1 | 2 | 3 {
  const r = strongFactualRatio(strongCount, maxTurns);
  if (r >= 0.42) return 3;
  if (r >= 0.28) return 2;
  if (r >= 0.2) return 1;
  return 0;
}

function configuredDialogueTurns(scenario: RoleplayScenario): number {
  return Math.max(1, scenario.sectionE?.maxTurns ?? 5);
}

function hasEmpathyCue(text: string): boolean {
  return /理解|了解|合理|正常|很多客戶|確實|同意|在意|非常理解|我能理解/.test(text);
}

/** 有同理用語但迴避問題、只推試乘／體感 */
function isDeflectingAgentReply(agent: string): boolean {
  if (isOpeningGreeting(agent) || isLowQualityAgentReply(agent)) return false;
  const deflectCue = /數據.*僅供參考|實際感受|實際駕駛|建議.*試乘|安排試乘|體驗比較準|現場.*分析/;
  const hasSubstance =
    hasConcreteNumbers(agent) &&
    /萬|試算|稅金|WLTC|油耗|分貝|加總|折扣|定保|電池/.test(agent);
  if (deflectCue.test(agent) && !hasSubstance) return true;
  if (/試乘|試駕/.test(agent) && agent.length < 72 && !hasSubstance) return true;
  return false;
}

function substantiveAgentTexts(agentTexts: string[]): string[] {
  return agentTexts.filter((t) => !isOpeningGreeting(t) && !hasPoliteClosing([t]));
}

function deflectingRatio(agentTexts: string[]): number {
  const substantive = substantiveAgentTexts(agentTexts);
  if (!substantive.length) return 0;
  const deflects = substantive.filter((t) => isDeflectingAgentReply(t)).length;
  return deflects / substantive.length;
}

const ADVANCE_CUE = /試乘|試駕|試算|預約|安排/;
const SPECIFIC_TIME_INVITE =
  /週[一二三四五六日天]|明天|今天|上午|下午|方便.*嗎|幾點|預約.*時間/;

function extractKeyPointKeywords(keyPoint: string): string[] {
  const tokens = keyPoint.match(/[\u4e00-\u9fff]{2,}|[A-Za-z][\w.]*/g) ?? [];
  const stop = new Set(["可以", "並且", "以及", "如果", "需要", "建議", "應該", "透過", "進行"]);
  return tokens.filter((t) => !stop.has(t) && t.length >= 2);
}

function keyPointHit(agentJoined: string, keyPoint: string): boolean {
  const keywords = extractKeyPointKeywords(keyPoint);
  if (keywords.length === 0) return false;
  const hits = keywords.filter((k) => agentJoined.includes(k));
  const need = keywords.length === 1 ? 1 : Math.min(2, keywords.length);
  return hits.length >= need;
}

function forbiddenHit(agentJoined: string, forbidden: string): boolean {
  const keywords = extractKeyPointKeywords(forbidden);
  if (keywords.length === 0) return forbidden.split(/[，,、]/).some((p) => p.trim() && agentJoined.includes(p.trim()));
  const hits = keywords.filter((k) => agentJoined.includes(k));
  return hits.length >= Math.min(2, keywords.length);
}

function hasPoliteOpening(agentTurns: string[]): boolean {
  const first = agentTurns[0]?.trim() ?? "";
  return /您好|你好|歡迎|在看這台|有什麼想了解|都可以問我|都可以為您/.test(first);
}

function hasPoliteClosing(agentTurns: string[]): boolean {
  const last = agentTurns[agentTurns.length - 1]?.trim() ?? "";
  return /感謝|謝謝|歡迎再|再找我|有任何問題/.test(last);
}

function isRudeInvite(text: string): boolean {
  return /快點約|趕快約|隨便啦|管他|無所謂/i.test(text);
}

function addressesCustomerTopic(agent: string, customer: string): boolean {
  const checks: [RegExp, RegExp][] = [
    [/電池|油電|過保/, /電池|油電|過保|保固|更換/],
    [/座椅|疲勞|長途|舒服/, /座椅|疲勞|長途|腰|支撐|舒服/],
    [/高速|風切|公路上/, /高速|風切|120|100|\d+\s*km/],
    [/分貝|隔音|玻璃/, /分貝|隔音|玻璃|雙層|NVH/],
    [/盲|旋鈕|按鍵|觸控|螢幕/, /盲|旋鈕|按鍵|觸控|實體/],
    [/試算|成本|十年|持有/, /試算|成本|十年|持有|萬|稅金|加總/],
    [/油耗|油價|WLTC|市區/, /油耗|油價|WLTC|km|市區|油資/],
    [/空間|後座/, /空間|後座|椅背|變化/],
  ];
  for (const [ask, cover] of checks) {
    if (ask.test(customer) && !cover.test(agent)) return false;
  }
  return true;
}

/** 明顯敷衍或未正面回答（部分有答的不算） */
function isEvasiveAgentReply(agent: string, customer: string): boolean {
  if (isLowQualityAgentReply(agent)) return true;
  if (customer.trim().length < 10) return false;
  const askedSubstance =
    /試算|成本|油耗|WLTC|持有|十年|分貝|隔音|盲|按鍵|旋鈕|空間|電池|保養|路況|座椅|高速|油價/.test(
      customer,
    );
  if (!askedSubstance) return false;
  const hasSubstance =
    (hasConcreteNumbers(agent) &&
      /萬|WLTC|試算|分貝|加總|稅金|定保|油資|電池/.test(agent)) ||
    /按鍵|按鈕|旋鈕|盲操|實體|滑移|傾角|後座|空間|椅背|雙層|玻璃/.test(agent);
  if (hasSubstance) return false;
  if (!addressesCustomerTopic(agent, customer)) {
    return agent.length < 80;
  }
  return /數據僅供參考|實際感受才是最準確|建議.*試乘|安排試乘|體驗比較準確|相信.*比較好|不會一一測試/.test(
    agent,
  );
}

function scoreEmpathy(
  agentTexts: string[],
  topicMisses: number,
  factGaps: number,
): { score: number; comment: string } {
  const joined = agentTexts.join("\n");
  const substantive = substantiveAgentTexts(agentTexts);
  const garbageRatio = substantive.length
    ? substantive.filter((t) => isLowQualityAgentReply(t)).length / substantive.length
    : 1;

  if (garbageRatio >= 0.6) {
    return {
      score: garbageRatio >= 0.8 ? 1 : 4,
      comment: "多輪回應過於敷衍或答非所問，同理承接不足。",
    };
  }

  const coverageGaps = Math.max(topicMisses, factGaps);
  let score = 15;
  const empathetic = hasEmpathyCue(joined);
  if (empathetic) score += 2;
  if (coverageGaps <= 1 && empathetic) score += 1;
  if (coverageGaps >= 3) score -= 2;
  else if (coverageGaps >= 2) score -= 1;

  const comment =
    coverageGaps >= 2 && empathetic
      ? "有承接用語，但多輪未正面回應客戶追問。"
      : empathetic && coverageGaps <= 1
        ? "有先承接客戶疑慮並貼題回應。"
        : empathetic
          ? "有先承接客戶疑慮。"
          : "可再多一句同理再進入說明。";

  return { score: clampDimension(score), comment };
}

function countTopicMisses(turns: RoleplayChatTurn[]): number {
  const coalesced = coalesceAdjacentAgentTurns(turns);
  let misses = 0;
  for (let i = 0; i < coalesced.length - 1; i++) {
    const c = coalesced[i]!;
    const a = coalesced[i + 1]!;
    if (c.role !== "customer" || a.role !== "agent") continue;
    if (isOpeningGreeting(a.content)) continue;
    if (isEvasiveAgentReply(a.content, c.content)) misses++;
  }
  return misses;
}

function agentGarbageRatio(agentTexts: string[]): number {
  const substantive = substantiveAgentTexts(agentTexts);
  if (!substantive.length) return 1;
  return substantive.filter((t) => isLowQualityAgentReply(t)).length / substantive.length;
}

function scoreStructure(
  factGaps: number,
  topicMisses: number,
  agentTexts: string[],
): { score: number; comment: string } {
  const garbageRatio = agentGarbageRatio(agentTexts);
  let gaps = Math.max(factGaps, Math.floor(topicMisses * 0.6));
  if (garbageRatio >= 0.6) gaps = Math.max(gaps, Math.ceil(substantiveAgentTexts(agentTexts).length * 0.75));
  let score = clampDimension(Math.round(20 - gaps * 2));
  if (factGaps >= 3) score = Math.min(score, 16);
  else if (factGaps >= 2) score = Math.min(score, 17);
  if (factGaps <= 1 && gaps <= 1) score = Math.max(score, 18);
  if (gaps <= 2 && garbageRatio < 0.4) score = Math.max(score, 15);

  const comment =
    gaps === 0
      ? "客戶議題皆有回應到。"
      : gaps <= 2
        ? `有 ${gaps} 處客戶追問可再補齊。`
        : `尚有 ${gaps} 處論點缺口，建議逐項回應。`;
  return { score, comment };
}

function scoreFactCheck(
  turns: RoleplayChatTurn[],
  scenario: RoleplayScenario,
  factGaps: number,
  topicMisses: number,
  agentTexts: string[],
): { score: number; comment: string } {
  const maxTurns = configuredDialogueTurns(scenario);
  const strong = countStrongFactualRounds(turns);
  let tier = strongFactualTier(strong, maxTurns);
  const ratio = strongFactualRatio(strong, maxTurns);
  const deflect = deflectingRatio(agentTexts);

  if (deflect >= 0.5 && tier > 1) tier = (tier - 1) as 0 | 1 | 2 | 3;
  if (factGaps >= 4 && tier > 1) tier = (tier - 1) as 0 | 1 | 2 | 3;

  const tierBase: Record<0 | 1 | 2 | 3, [number, number]> = {
    0: [5, 9],
    1: [12, 16],
    2: [16, 19],
    3: [18, 20],
  };
  const [lo, hi] = tierBase[tier];
  const tierSpan = hi - lo;
  const withinTier =
    tier === 0
      ? lo + Math.round(ratio * tierSpan * 4)
      : lo + Math.round(Math.min(1, ratio / (tier === 1 ? 0.25 : tier === 2 ? 0.34 : 0.5)) * tierSpan);

  const coverageMisses = Math.max(factGaps, Math.floor(topicMisses * 0.5));
  const factDeduct = Math.min(4, Math.max(0, coverageMisses - 1));
  let score = clampDimension(withinTier - factDeduct);
  if (coverageMisses >= 2 && tier >= 3) score = Math.min(score, 18);
  if (coverageMisses >= 2 && deflect >= 0.4) score = Math.min(score, 17);
  if (coverageMisses >= 3 && tier <= 2) score = Math.min(score, 16);
  if (coverageMisses >= 4) score = Math.min(score, 14);
  if (coverageMisses >= 5) score = Math.min(score, 12);

  if (strong < 1) score = Math.min(score, 14);
  if (deflect >= 0.45) score = Math.min(score, 15);
  if (strong >= 3 && factGaps <= 1 && deflect < 0.35) score = Math.max(score, 19);
  if (strong >= 2 && factGaps <= 2 && deflect < 0.3) score = Math.max(score, 18);

  const tierComment: Record<0 | 1 | 2 | 3, string> = {
    0: "較少引用具體試算或產品數字。",
    1: "有部分輪次帶出試算或成本數字。",
    2: "多輪有具體數字與成本說明。",
    3: "強事實輪次充足，數字引用到位。",
  };
  return { score, comment: tierComment[tier] };
}

function scoreStrategy(
  scenario: RoleplayScenario,
  agentTexts: string[],
  strategyGaps: number,
): { score: number; comment: string } {
  const joined = agentTexts.join("\n");
  const garbageRatio = agentGarbageRatio(agentTexts);
  let score = 0;

  if (hasPoliteOpening(agentTexts) && hasPoliteClosing(agentTexts)) {
    score = 14;
  } else if (hasPoliteOpening(agentTexts) || hasPoliteClosing(agentTexts)) {
    score = 11;
  }

  const keyHits = scenario.sectionD.keyPoints.filter((kp) => keyPointHit(joined, kp)).length;
  score += keyHits * 2;

  const forbiddenHits = scenario.sectionD.forbidden.filter((f) => forbiddenHit(joined, f)).length;
  score -= forbiddenHits * 5;

  score -= Math.min(2, strategyGaps);

  const deferCount = agentTexts.filter((t) => isAgentStrategyDeferReply(t)).length;
  score -= Math.min(1, deferCount);

  const rudeCount = agentTexts.filter((t) => isRudeInvite(t)).length;
  score -= rudeCount * 5;

  const hasTrialMethodology =
    hasConcreteNumbers(joined) &&
    /加總|試算|車價|稅金|油資|十年|10年|WLTC/.test(joined);
  if (hasTrialMethodology && strategyGaps === 0) score += 2;

  const comment =
    forbiddenHits > 0
      ? "觸及禁止說法或未依銷售策略回應。"
      : strategyGaps > 0
        ? `有 ${strategyGaps} 處策略待加強（延後說明或邀約方式）。`
        : keyHits >= 2
          ? "開收尾得體，關鍵話術有帶到。"
          : "基本禮貌到位，可再對準 Section D 重點。";

  if (garbageRatio >= 0.6) {
    score = Math.min(score, garbageRatio >= 0.8 ? 6 : 10);
  }
  return { score: clampDimension(Math.max(10, score)), comment };
}

function scoreAdvance(agentTexts: string[]): { score: number; comment: string } {
  const joined = agentTexts.join("\n");
  const garbageRatio = agentGarbageRatio(agentTexts);
  if (!ADVANCE_CUE.test(joined)) {
    return { score: 3, comment: "收尾未邀請試乘、試算或下一步。" };
  }

  let score = garbageRatio >= 0.6 ? 10 : 14;
  const deflect = deflectingRatio(agentTexts);
  if (SPECIFIC_TIME_INVITE.test(joined) && deflect < 0.3 && garbageRatio < 0.6) score += 2;
  if (
    (/試算表|試算.*帶|帶回.*討論|成本表/.test(joined) ||
      (/加總|十年.*萬|30\s*幾萬/.test(joined) && /試算|車價|稅金/.test(joined))) &&
    deflect < 0.3
  ) {
    score += 2;
  }
  if (deflect >= 0.35) score = Math.min(score, 14);
  return {
    score: clampDimension(score),
    comment:
      SPECIFIC_TIME_INVITE.test(joined) && deflect < 0.35
        ? "有具體邀約試乘或安排時間。"
        : "有推進試乘或試算，可再給明確時段。",
  };
}

export type DimensionScoreBundle = {
  dimensions: RoleplayDimensionScore[];
  total: number;
  factGapCount: number;
  strategyGapCount: number;
};

export function computeDimensionScores(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): DimensionScoreBundle {
  const coalesced = coalesceAdjacentAgentTurns(turns);
  const agentTexts = coalesced.filter((t) => t.role === "agent").map((t) => t.content);

  const candidates = detectCorrectionCandidates(scenario, turns);
  const factGaps = candidates.filter((c) => c.category === "fact").length;
  const strategyGaps = candidates.filter((c) => c.category === "strategy").length;
  const topicMisses = countTopicMisses(turns);

  const dims = ROLEPLAY_GLOBAL_CONFIG.rubricDimensions;
  const scored: Record<string, { score: number; comment: string }> = {
    empathy: scoreEmpathy(agentTexts, topicMisses, factGaps),
    structure: scoreStructure(factGaps, topicMisses, agentTexts),
    factCheck: scoreFactCheck(turns, scenario, factGaps, topicMisses, agentTexts),
    strategy: scoreStrategy(scenario, agentTexts, strategyGaps),
    advance: scoreAdvance(agentTexts),
  };

  const dimensions: RoleplayDimensionScore[] = dims.map((d) => ({
    dimensionId: d.id,
    label: d.label,
    score: scored[d.id]?.score ?? 0,
    maxScore: DIMENSION_MAX,
    comment: scored[d.id]?.comment ?? "—",
  }));

  const total = dimensions.reduce((s, x) => s + x.score, 0);
  return { dimensions, total, factGapCount: factGaps, strategyGapCount: strategyGaps };
}

/** 評分主流程與測試腳本用：回傳五維與加總 */
export function scoreFiveDimensions(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): { dimensions: RoleplayDimensionScore[]; score: number } {
  const { dimensions, total } = computeDimensionScores(scenario, turns);
  return { dimensions, score: total };
}
