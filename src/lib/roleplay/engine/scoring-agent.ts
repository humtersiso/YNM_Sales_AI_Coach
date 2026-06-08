import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import {
  buildSessionCorrections,
  detectCorrectionCandidates,
  inferCorrectionCategory,
  isGarbageIssue,
  isRawRagDump,
  normalizeCorrectionPoint,
} from "@/lib/roleplay/engine/correction-builder";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import { loadRoleplaySkill } from "@/lib/roleplay/skills/load-skill";
import { ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";
import type {
  RoleplayChatTurn,
  RoleplayCorrectionPoint,
  RoleplayScoreResult,
} from "@/lib/roleplay/session-types";
import { clampScore, scoreToGrade } from "@/lib/roleplay/engine/grade-mapper";
import { coalesceAdjacentAgentTurns } from "@/lib/roleplay/engine/turn-coalesce";

const DIMENSION_MAX = 20;

function formatHistory(turns: RoleplayChatTurn[]): string {
  return coalesceAdjacentAgentTurns(turns)
    .map((t) => `${t.role === "customer" ? "客戶" : "業代"}：${t.content}`)
    .join("\n");
}

function clampDimension(n: number): number {
  return Math.min(DIMENSION_MAX, Math.max(0, Math.round(n)));
}

function hasEmpathyCue(text: string): boolean {
  return /理解|了解|合理|正常|很多客戶|確實|同意|在意/.test(text);
}

function hasAdvanceCue(text: string): boolean {
  return /試乘|試算|第二次|保留|週[一二三四五六日天]|明天|今天|方便.*嗎|安排/.test(text);
}

function extractFactCues(scenario: RoleplayScenario): string[] {
  const cues: string[] = ["WLTC", "試算", "年里程", "油價", "km/L", "綜合油耗", "測試基準", "測試條件"];
  for (const f of scenario.sectionC.facts) {
    const nums = f.value.match(/\d+\.?\d*/g) ?? [];
    for (const n of nums) {
      if (n.length >= 2) cues.push(n);
    }
  }
  return [...new Set(cues)];
}

function hasSessionFactCue(text: string, scenario: RoleplayScenario): boolean {
  const cues = extractFactCues(scenario);
  const lower = text.toLowerCase();
  return cues.some((c) => lower.includes(c.toLowerCase()) || text.includes(c));
}

function customerAskedFactTopic(turns: RoleplayChatTurn[]): boolean {
  const customerText = turns.filter((t) => t.role === "customer").map((t) => t.content).join("\n");
  return /油耗|價格|保養|配備|數字|試算|隔音|玻璃|盲|旋鈕/.test(customerText);
}

function toLegacyUnused(correctionPoints: RoleplayCorrectionPoint[]): string[] {
  return correctionPoints.map((c) => c.issue).slice(0, 5);
}

async function applyCorrections(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
  partial: Omit<RoleplayScoreResult, "unusedStrategies" | "correctionPoints" | "improvementTips"> & {
    correctionPoints?: RoleplayCorrectionPoint[];
    improvementTips?: string[];
  },
): Promise<RoleplayScoreResult> {
  const correctionPoints = await buildSessionCorrections(scenario, turns);

  return {
    ...partial,
    correctionPoints,
    improvementTips: [],
    unusedStrategies: toLegacyUnused(correctionPoints),
  };
}

/** 舊場次重新產出修正點（依對話紀錄） */
export async function enrichScoreResult(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
  result: RoleplayScoreResult,
): Promise<RoleplayScoreResult> {
  return applyCorrections(scenario, turns, {
    ...result,
    correctionPoints: (result.correctionPoints ?? []).filter(
      (p) => !isGarbageIssue(p.issue) && !isRawRagDump(p.correctGuide),
    ),
    improvementTips: [],
  });
}

function buildHeuristicSummary(
  agentJoined: string,
  correctionPoints: RoleplayCorrectionPoint[],
): string {
  const strengths: string[] = [];
  if (hasEmpathyCue(agentJoined)) strengths.push("有先承接客戶疑慮");
  if (hasAdvanceCue(agentJoined)) strengths.push("有推進試乘或下一步");

  const strengthPart =
    strengths.length > 0
      ? `本場${strengths.join("、")}。`
      : "本場已完成對話回應。";
  const gapPart =
    correctionPoints.length > 0
      ? `以下 ${correctionPoints.length} 處為客戶有問到、可再精準補強。`
      : "客戶疑慮皆有回應到，表現穩定。";

  return `${strengthPart}${gapPart}`;
}

async function heuristicScore(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): Promise<RoleplayScoreResult> {
  const agentTexts = turns.filter((t) => t.role === "agent").map((t) => t.content);
  const joined = agentTexts.join("\n");
  const factRelevant = customerAskedFactTopic(turns);
  const gapCount = detectCorrectionCandidates(scenario, turns).length;

  let base = 12;
  if (agentTexts.length >= 3) base += 2;
  if (hasEmpathyCue(joined)) base += 2;
  if (!factRelevant || hasSessionFactCue(joined, scenario)) base += 2;
  if (hasAdvanceCue(joined)) base += 2;
  if (gapCount >= 3) base -= 3;
  else if (gapCount >= 1) base -= 1;

  const dimensions = ROLEPLAY_GLOBAL_CONFIG.rubricDimensions.map((d) => {
    let dimBase = base;
    if (d.id === "empathy") dimBase += hasEmpathyCue(joined) ? 3 : 0;
    if (d.id === "factCheck") {
      if (!factRelevant) dimBase += 1;
      else dimBase += hasSessionFactCue(joined, scenario) ? 3 : -2;
    }
    if (d.id === "advance") dimBase += hasAdvanceCue(joined) ? 3 : -1;
    if (d.id === "structure") dimBase += agentTexts.length >= 3 ? 2 : 0;
    if (d.id === "strategy") dimBase += gapCount <= 1 ? 2 : -1;

    const comments: Record<string, string> = {
      empathy: hasEmpathyCue(joined) ? "有接住客戶情緒。" : "客戶追問時可多一句同理。",
      structure: agentTexts.length >= 3 ? "多輪回應有推進。" : "建議承接→事實→引導。",
      factCheck: !factRelevant
        ? "客戶未深入追問事實。"
        : hasSessionFactCue(joined, scenario)
          ? "有引用具體數字或條件。"
          : "客戶問到的數字／條件可再補齊。",
      strategy: gapCount <= 1 ? "回應方向大致正確。" : "部分追問可再對準客戶問題。",
      advance: hasAdvanceCue(joined) ? "有具體下一步。" : "收尾可邀請試乘或試算。",
    };

    return {
      dimensionId: d.id,
      label: d.label,
      score: clampDimension(dimBase),
      maxScore: DIMENSION_MAX,
      comment: comments[d.id] ?? "—",
    };
  });

  const score = clampScore(dimensions.reduce((s, x) => s + x.score, 0));
  const { grade, gradeLabel, advice } = scoreToGrade(score);

  return applyCorrections(scenario, turns, {
    score,
    grade,
    gradeLabel,
    advice,
    summary: buildHeuristicSummary(joined, []),
    dimensions,
    previousScore: null,
    scoreDelta: null,
  });
}

type LlmCorrectionPayload = {
  issue?: string;
  whatYouSaid?: string;
  correctGuide?: string;
};

type LlmScorePayload = {
  score?: number;
  summary?: string;
  improvementTips?: string[];
  correctionPoints?: LlmCorrectionPayload[];
  dimensions?: { dimensionId?: string; score?: number; comment?: string }[];
};

function parseCorrectionPoints(raw: LlmCorrectionPayload[] | undefined): RoleplayCorrectionPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) =>
      normalizeCorrectionPoint({
        issue: String(c.issue ?? "").trim(),
        category: inferCorrectionCategory(String(c.issue ?? "")),
        customerAsk: String((c as { customerAsk?: string }).customerAsk ?? "").trim() || undefined,
        whatYouSaid: String(c.whatYouSaid ?? "").trim() || undefined,
        correctGuide: String(c.correctGuide ?? "").trim(),
      }),
    )
    .filter((c) => c.issue.length >= 4 && c.correctGuide.length >= 12)
    .filter((c) => !isGarbageIssue(c.issue) && !isRawRagDump(c.correctGuide))
    .slice(0, 4);
}

export async function scoreRoleplaySession(input: {
  scenario: RoleplayScenario;
  turns: RoleplayChatTurn[];
}): Promise<RoleplayScoreResult> {
  const { scenario, turns } = input;
  const dims = ROLEPLAY_GLOBAL_CONFIG.rubricDimensions;
  const facts = scenario.sectionC.facts
    .map((f) => `- ${f.label}：${f.value.slice(0, 200)}`)
    .join("\n");

  const skill = loadRoleplaySkill("skill_post_chat_evaluator.md");
  const prompt = `${skill}

【評分維度】每項 0～20，加總 0～100
${dims.map((d) => `- ${d.id} ${d.label}`).join("\n")}

【佐證資料】
${facts || "（無）"}

【完整對話】
${formatHistory(turns)}

輸出 JSON（correctionPoints 僅列客戶「有問到」且業代「該輪沒答好」者，開場打招呼不糾正，客戶沒問保養勿列）：
{
  "score": 0-100,
  "summary": "2-3句",
  "correctionPoints": [{ "issue": "", "whatYouSaid": "", "correctGuide": "2-3句口語詳解，勿貼PDF" }],
  "dimensions": [{ "dimensionId": "empathy", "score": 0-20, "comment": "" }]
}`;

  const raw = await geminiGenerateText(prompt, { json: true, maxOutputTokens: 1200, temperature: 0.2 });
  if (!raw) return heuristicScore(scenario, turns);

  try {
    const parsed = JSON.parse(raw) as LlmScorePayload;
    const dimensions = dims.map((d) => {
      const hit = parsed.dimensions?.find((x) => x.dimensionId === d.id);
      return {
        dimensionId: d.id,
        label: d.label,
        score: clampDimension(Number(hit?.score ?? 0)),
        maxScore: DIMENSION_MAX,
        comment: String(hit?.comment ?? "").trim() || "—",
      };
    });
    const score = clampScore(
      Number(parsed.score ?? dimensions.reduce((s, x) => s + x.score, 0)),
    );
    const { grade, gradeLabel, advice } = scoreToGrade(score);

    const result = await applyCorrections(scenario, turns, {
      score,
      grade,
      gradeLabel,
      advice,
      summary: String(parsed.summary ?? "").trim() || "已完成評分。",
      dimensions,
      correctionPoints: parseCorrectionPoints(parsed.correctionPoints),
      previousScore: null,
      scoreDelta: null,
    });

    return {
      ...result,
      summary: buildHeuristicSummary(
        turns
          .filter((t) => t.role === "agent")
          .map((t) => t.content)
          .join("\n"),
        result.correctionPoints,
      ),
    };
  } catch {
    return heuristicScore(scenario, turns);
  }
}
