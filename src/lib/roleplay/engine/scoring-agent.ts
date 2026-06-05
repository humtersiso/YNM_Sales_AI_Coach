import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import { loadRoleplaySkill } from "@/lib/roleplay/skills/load-skill";
import { ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";
import type { RoleplayChatTurn, RoleplayScoreResult } from "@/lib/roleplay/session-types";
import { clampScore, scoreToGrade } from "@/lib/roleplay/engine/grade-mapper";

const DIMENSION_MAX = 20;

function formatHistory(turns: RoleplayChatTurn[]): string {
  return turns
    .map((t) => `${t.role === "customer" ? "客戶" : "業代"}：${t.content}`)
    .join("\n");
}

function clampDimension(n: number): number {
  return Math.min(DIMENSION_MAX, Math.max(0, Math.round(n)));
}

function hasEmpathyCue(text: string): boolean {
  return /理解|了解|合理|正常|很多客戶|確實|同意|在意/.test(text);
}

function hasFactCue(text: string): boolean {
  return /WLTC|km\/L|試算|年里程|油價|14\.3|綜合油耗|測試基準|測試條件/.test(text);
}

function hasAdvanceCue(text: string): boolean {
  return /試乘|試算|第二次|保留|週[一二三四五六日天]|明天|今天|方便.*嗎|安排/.test(text);
}

function buildHeuristicSummary(
  scenario: RoleplayScenario,
  agentJoined: string,
  gaps: string[],
): string {
  const strengths: string[] = [];
  if (hasEmpathyCue(agentJoined)) strengths.push("有先承接客戶疑慮");
  if (hasFactCue(agentJoined)) strengths.push("有帶入油耗或試算基準");
  if (hasAdvanceCue(agentJoined)) strengths.push("有推進試乘或下一步");

  const strengthPart =
    strengths.length > 0
      ? `本場${strengths.join("、")}。`
      : "本場已完成對話回應，建議加強結構化表達。";
  const gapPart =
    gaps.length > 0
      ? `可再精進：${gaps.slice(0, 2).join("、")}。`
      : "可對照本場素材區策略方向再練一次。";

  const issue = scenario.sectionA.coreIssue;
  if (issue && !hasFactCue(agentJoined) && /油耗|成本|油錢/.test(issue)) {
    return `${strengthPart}此情境重點在油耗與試算，建議補上 WLTC 基準與年油費差額。${gapPart}`;
  }
  if (issue && !hasAdvanceCue(agentJoined) && /價格|促銷|預算/.test(issue)) {
    return `${strengthPart}此情境重點在方案透明與成交推進，建議補上月供試算或今日可行動。${gapPart}`;
  }
  return `${strengthPart}${gapPart}`;
}

function heuristicScore(scenario: RoleplayScenario, turns: RoleplayChatTurn[]): RoleplayScoreResult {
  const agentTexts = turns.filter((t) => t.role === "agent").map((t) => t.content);
  const joined = agentTexts.join("\n");
  let base = 12;
  if (agentTexts.length >= 3) base += 2;
  if (agentTexts.length >= 5) base += 2;
  if (hasEmpathyCue(joined)) base += 2;
  if (hasFactCue(joined)) base += 2;
  if (hasAdvanceCue(joined)) base += 2;
  for (const kp of scenario.sectionD.keyPoints) {
    if (joined.includes(kp.slice(0, 6))) base += 1;
  }
  for (const f of scenario.sectionD.forbidden) {
    if (joined.includes(f.slice(0, 4))) base -= 3;
  }

  const gaps: string[] = [];
  if (!hasEmpathyCue(joined)) gaps.push("開場先同理客戶疑慮");
  if (!hasFactCue(joined)) gaps.push("補上佐證數字與試算方式");
  if (!hasAdvanceCue(joined)) gaps.push("結尾邀請試乘或提供試算表");
  const unused = scenario.sectionD.keyPoints.filter(
    (kp) => !joined.includes(kp.slice(0, Math.min(6, kp.length))),
  );

  const dimensions = ROLEPLAY_GLOBAL_CONFIG.rubricDimensions.map((d) => {
    let dimBase = base;
    if (d.id === "empathy") dimBase += hasEmpathyCue(joined) ? 3 : -2;
    if (d.id === "factCheck") dimBase += hasFactCue(joined) ? 3 : -2;
    if (d.id === "advance") dimBase += hasAdvanceCue(joined) ? 3 : -2;
    if (d.id === "structure") dimBase += agentTexts.length >= 3 ? 2 : 0;
    if (d.id === "strategy") dimBase += unused.length <= 1 ? 2 : -1;

    const comments: Record<string, string> = {
      empathy: hasEmpathyCue(joined)
        ? "有接住客戶情緒與動機。"
        : "建議先認同客戶比較或疑慮的合理性。",
      structure: agentTexts.length >= 3
        ? "多輪回應有持續推進。"
        : "建議依「承接→事實→價值→引導」順序回應。",
      factCheck: hasFactCue(joined)
        ? "有引用基準或試算方式。"
        : "建議對照素材區佐證，說明 WLTC 或試算公式。",
      strategy: unused.length <= 1
        ? "多數策略方向有落地。"
        : "部分策略尚未使用，可對照素材區補強。",
      advance: hasAdvanceCue(joined)
        ? "有具體下一步邀約。"
        : "建議給試乘時段、試算表或二訪時間。",
    };

    return {
      dimensionId: d.id,
      label: d.label,
      score: clampDimension(dimBase),
      maxScore: DIMENSION_MAX,
      comment: comments[d.id] ?? "請參考素材區策略方向再練習。",
    };
  });

  const score = clampScore(dimensions.reduce((s, x) => s + x.score, 0));
  const { grade, gradeLabel, advice } = scoreToGrade(score);
  const improvementTips = gaps.length > 0 ? gaps.slice(0, 2) : ["對照五維圖較低項目再練同一情境"];

  return {
    score,
    grade,
    gradeLabel,
    advice,
    summary: buildHeuristicSummary(scenario, joined, gaps),
    dimensions,
    improvementTips,
    unusedStrategies: unused.slice(0, 3),
    previousScore: null,
    scoreDelta: null,
  };
}

type LlmScorePayload = {
  score?: number;
  summary?: string;
  improvementTips?: string[];
  unusedStrategies?: string[];
  dimensions?: { dimensionId?: string; score?: number; comment?: string }[];
};

export async function scoreRoleplaySession(input: {
  scenario: RoleplayScenario;
  turns: RoleplayChatTurn[];
}): Promise<RoleplayScoreResult> {
  const { scenario, turns } = input;
  const dims = ROLEPLAY_GLOBAL_CONFIG.rubricDimensions;
  const facts = scenario.sectionC.facts.map((f) => `- ${f.label}：${f.value}`).join("\n");
  const criteria = scenario.sectionF.criteria
    .map(
      (c) =>
        `- ${c.dimensionId} 高分：${c.highExample}；低分：${c.lowExample}`,
    )
    .join("\n");

  const skill = loadRoleplaySkill("skill_post_chat_evaluator.md");
  const prompt = `${skill}

【評分維度】每項 0～20 分，五項加總為總分（0～100）
${dims.map((d) => `- ${d.id} ${d.label} 權重${d.weight}`).join("\n")}

【佐證資料（事實查核）】
${facts}

【策略】建議：${scenario.sectionD.keyPoints.join("；")}
禁止：${scenario.sectionD.forbidden.join("；")}
建議成交動作：${scenario.sectionD.closingActions.join("、")}

【情境專屬標準】
${criteria}

【完整對話】
${formatHistory(turns)}

輸出 JSON：
{
  "score": 0-100 整數（五維度之和）,
  "summary": "2-3句總評",
  "improvementTips": ["最需改進 1-2 點"],
  "unusedStrategies": ["未使用的策略方向 1-3 項"],
  "dimensions": [
    { "dimensionId": "empathy", "score": 0-20, "comment": "一句話" }
  ]
}
dimensions 需包含：${dims.map((d) => d.id).join(", ")}`;

  const raw = await geminiGenerateText(prompt, { json: true, maxOutputTokens: 1100, temperature: 0.2 });
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
    return {
      score,
      grade,
      gradeLabel,
      advice,
      summary: String(parsed.summary ?? "").trim() || "已完成評分。",
      dimensions,
      improvementTips: Array.isArray(parsed.improvementTips)
        ? parsed.improvementTips.map(String).filter(Boolean).slice(0, 3)
        : [],
      unusedStrategies: Array.isArray(parsed.unusedStrategies)
        ? parsed.unusedStrategies.map(String).filter(Boolean).slice(0, 5)
        : scenario.sectionD.keyPoints.slice(0, 2),
      previousScore: null,
      scoreDelta: null,
    };
  } catch {
    return heuristicScore(scenario, turns);
  }
}
