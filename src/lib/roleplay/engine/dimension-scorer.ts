import {
  detectCorrectionCandidates,
  addressesCustomerTopic,
  isAgentStrategyDeferReply,
  isEvasiveAgentReply,
  isLowQualityAgentReply,
  isOpeningGreeting,
  isWeakAgentReply,
} from "@/lib/roleplay/engine/correction-builder";
import {
  answerTargetsWrongCompetitor,
  hasConcreteNumbers,
} from "@/lib/roleplay/engine/correction-guide";
import { coalesceAdjacentAgentTurns } from "@/lib/roleplay/engine/turn-coalesce";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import { ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";
import type { RoleplayChatTurn, RoleplayDimensionScore } from "@/lib/roleplay/session-types";

export { isLowQualityAgentReply } from "@/lib/roleplay/engine/correction-builder";

const DIMENSION_MAX = 20;

/** @deprecated 已移除總分上限；保留常數僅供舊測試／文件參考 */
export const STRICT_SCORE_CAP = 72;

function clampDimension(n: number): number {
  return Math.min(DIMENSION_MAX, Math.max(0, Math.round(n)));
}

/** 含具體數字且「貼題」回應客戶該輪提問的業代輪次（不含開場招呼） */
export function countStrongFactualRounds(
  turns: RoleplayChatTurn[],
  sessionCompetitor?: string,
): number {
  const coalesced = coalesceAdjacentAgentTurns(turns);
  let count = 0;
  for (let i = 0; i < coalesced.length; i++) {
    const t = coalesced[i]!;
    if (t.role !== "agent" || isOpeningGreeting(t.content)) continue;

    let customer = "";
    for (let j = i - 1; j >= 0; j--) {
      if (coalesced[j]!.role === "customer") {
        customer = coalesced[j]!.content;
        break;
      }
    }

    const a = t.content;
    if (
      !isLowQualityAgentReply(a) &&
      hasConcreteNumbers(a) &&
      /萬|試算|持有成本|稅金|折扣|油耗|WLTC|分貝|定保|油資|十年|10年|電池|加總/.test(a) &&
      customer.length >= 10 &&
      addressesCustomerTopic(a, customer) &&
      (!sessionCompetitor ||
        !answerTargetsWrongCompetitor(a, sessionCompetitor, customer))
    ) {
      count++;
    }
  }
  return count;
}

/** 有數字但答非所問／比錯競品的輪次（灌水詳細也不加分） */
function countOffTopicNumericRounds(
  turns: RoleplayChatTurn[],
  sessionCompetitor: string,
): number {
  const coalesced = coalesceAdjacentAgentTurns(turns);
  let count = 0;
  for (let i = 0; i < coalesced.length; i++) {
    const t = coalesced[i]!;
    if (t.role !== "agent" || isOpeningGreeting(t.content)) continue;

    let customer = "";
    for (let j = i - 1; j >= 0; j--) {
      if (coalesced[j]!.role === "customer") {
        customer = coalesced[j]!.content;
        break;
      }
    }
    if (customer.trim().length < 10) continue;

    const a = t.content;
    const hasNumericDump =
      hasConcreteNumbers(a) &&
      /萬|試算|WLTC|分貝|加總|稅金|定保|油資|十年|km/.test(a);
    if (!hasNumericDump) continue;

    if (
      !addressesCustomerTopic(a, customer) ||
      answerTargetsWrongCompetitor(a, sessionCompetitor, customer)
    ) {
      count++;
    }
  }
  return count;
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
      ? "客戶議題皆有貼題回應到。"
      : gaps <= 2
        ? `有 ${gaps} 處客戶追問可再補齊（先答所問再延伸）。`
        : `尚有 ${gaps} 處論點缺口，建議逐項貼題回應。`;
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
  const sessionComp = scenario.sectionA.competitor;
  const strong = countStrongFactualRounds(turns, sessionComp);
  const offTopicNumeric = countOffTopicNumericRounds(turns, sessionComp);
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
  const factDeduct = Math.min(6, Math.max(0, coverageMisses - 1) + factGaps);
  let score = clampDimension(withinTier - factDeduct);
  if (offTopicNumeric > 0) {
    score = clampDimension(score - Math.min(5, offTopicNumeric * 2));
  }
  if (coverageMisses >= 2 && tier >= 3) score = Math.min(score, 18);
  if (coverageMisses >= 2 && deflect >= 0.4) score = Math.min(score, 17);
  if (coverageMisses >= 3 && tier <= 2) score = Math.min(score, 16);
  if (coverageMisses >= 4) score = Math.min(score, 14);
  if (coverageMisses >= 5) score = Math.min(score, 12);

  if (strong < 1) score = Math.min(score, 14);
  if (deflect >= 0.45) score = Math.min(score, 15);

  const tierComment: Record<0 | 1 | 2 | 3, string> = {
    0: "較少貼題引用試算或產品數字。",
    1: "有部分數字，但多數回合須更對準客戶提問。",
    2: "多輪有具體數字，且大致貼題回應。",
    3: "強事實輪次充足，數字引用貼題到位。",
  };
  let comment = tierComment[tier];
  if (offTopicNumeric > 0) {
    comment = `有 ${offTopicNumeric} 輪雖帶數字但未對準客戶提問，詳細不等於答對。`;
  }
  return { score, comment };
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
          : "基本禮貌到位，可再帶出本場關鍵話術重點。";

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
  /** 已停用嚴格總分上限，恆為 false */
  strictScoreCapped: boolean;
};

export function computeDimensionScores(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): DimensionScoreBundle {
  const coalesced = coalesceAdjacentAgentTurns(turns);
  const agentTexts = coalesced.filter((t) => t.role === "agent").map((t) => t.content);

  const candidates = detectCorrectionCandidates(scenario, turns);
  const factGapCount = candidates.filter((c) => c.category === "fact").length;
  const strategyGaps = candidates.filter((c) => c.category === "strategy").length;
  const topicMisses = countTopicMisses(turns);
  const coverageGaps = Math.max(
    topicMisses,
    candidates.filter((c) => c.topic === "competitor").length,
  );

  const dims = ROLEPLAY_GLOBAL_CONFIG.rubricDimensions;
  const scored: Record<string, { score: number; comment: string }> = {
    empathy: scoreEmpathy(agentTexts, topicMisses, coverageGaps),
    structure: scoreStructure(coverageGaps, topicMisses, agentTexts),
    factCheck: scoreFactCheck(turns, scenario, coverageGaps, topicMisses, agentTexts),
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
  return {
    dimensions,
    total,
    factGapCount,
    strategyGapCount: strategyGaps,
    strictScoreCapped: false,
  };
}

/** 評分主流程與測試腳本用：回傳五維與加總 */
export function scoreFiveDimensions(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): { dimensions: RoleplayDimensionScore[]; score: number } {
  const { dimensions, total } = computeDimensionScores(scenario, turns);
  return { dimensions, score: total };
}
