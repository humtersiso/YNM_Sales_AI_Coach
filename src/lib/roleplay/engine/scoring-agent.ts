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

function heuristicScore(scenario: RoleplayScenario, turns: RoleplayChatTurn[]): RoleplayScoreResult {
  const agentTexts = turns.filter((t) => t.role === "agent").map((t) => t.content);
  const joined = agentTexts.join("\n");
  let base = 12;
  if (agentTexts.length >= 3) base += 2;
  if (agentTexts.length >= 5) base += 2;
  for (const kp of scenario.sectionD.keyPoints) {
    if (joined.includes(kp.slice(0, 6))) base += 1;
  }
  for (const f of scenario.sectionD.forbidden) {
    if (joined.includes(f.slice(0, 4))) base -= 3;
  }

  const dimensions = ROLEPLAY_GLOBAL_CONFIG.rubricDimensions.map((d) => ({
    dimensionId: d.id,
    label: d.label,
    score: clampDimension(base + (d.id === "empathy" ? 2 : 0)),
    maxScore: DIMENSION_MAX,
    comment: "請參考素材區策略方向再練習。",
  }));

  const score = clampScore(dimensions.reduce((s, x) => s + x.score, 0));
  const { grade, gradeLabel, advice } = scoreToGrade(score);

  return {
    score,
    grade,
    gradeLabel,
    advice,
    summary: "系統以規則估算分數（Gemini 評分不可用時）。建議完成對話後由主管複核。",
    dimensions,
    improvementTips: ["補強具體數字與測試條件說明", "疑慮化解後主動邀請試乘"],
    unusedStrategies: scenario.sectionD.keyPoints.slice(2, 4),
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
