import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import { ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";
import type { RoleplayChatTurn, RoleplayScoreResult } from "@/lib/roleplay/session-types";
import { clampScore, scoreToGrade } from "@/lib/roleplay/engine/grade-mapper";

function formatHistory(turns: RoleplayChatTurn[]): string {
  return turns
    .map((t) => `${t.role === "customer" ? "客戶" : "業代"}：${t.content}`)
    .join("\n");
}

function heuristicScore(scenario: RoleplayScenario, turns: RoleplayChatTurn[]): RoleplayScoreResult {
  const agentTexts = turns.filter((t) => t.role === "agent").map((t) => t.content);
  const joined = agentTexts.join("\n");
  let score = 62;
  if (agentTexts.length >= 3) score += 8;
  if (agentTexts.length >= 5) score += 5;
  for (const kp of scenario.sectionD.keyPoints) {
    if (joined.includes(kp.slice(0, 6))) score += 3;
  }
  for (const f of scenario.sectionD.forbidden) {
    if (joined.includes(f.slice(0, 4))) score -= 8;
  }
  score = clampScore(score);
  const { grade, gradeLabel, advice } = scoreToGrade(score);
  return {
    score,
    grade,
    gradeLabel,
    advice,
    summary: "系統以規則估算分數（Gemini 評分不可用時）。建議完成對話後由主管複核。",
    dimensions: ROLEPLAY_GLOBAL_CONFIG.rubricDimensions.map((d) => ({
      dimensionId: d.id,
      label: d.label,
      score: clampScore(score + (d.id === "empathy" ? 2 : 0)),
      comment: "請參考素材區策略方向再練習。",
    })),
  };
}

type LlmScorePayload = {
  score?: number;
  summary?: string;
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

  const prompt = `你是汽車銷售對練評分教練。請依下列標準評分，只輸出 JSON。

【評分維度與權重】
${dims.map((d) => `- ${d.id} ${d.label} 權重${d.weight}`).join("\n")}

【佐證資料（事實查核）】
${facts}

【策略】建議：${scenario.sectionD.keyPoints.join("；")}
禁止：${scenario.sectionD.forbidden.join("；")}

【情境專屬標準】
${criteria}

【完整對話】
${formatHistory(turns)}

輸出 JSON：
{
  "score": 0-100 整數,
  "summary": "2-3句總評",
  "dimensions": [
    { "dimensionId": "empathy", "score": 0-100, "comment": "一句話" }
  ]
}
dimensions 需包含：${dims.map((d) => d.id).join(", ")}`;

  const raw = await geminiGenerateText(prompt, { json: true, maxOutputTokens: 900, temperature: 0.2 });
  if (!raw) return heuristicScore(scenario, turns);

  try {
    const parsed = JSON.parse(raw) as LlmScorePayload;
    const score = clampScore(Number(parsed.score ?? 70));
    const { grade, gradeLabel, advice } = scoreToGrade(score);
    const dimensions = dims.map((d) => {
      const hit = parsed.dimensions?.find((x) => x.dimensionId === d.id);
      return {
        dimensionId: d.id,
        label: d.label,
        score: clampScore(Number(hit?.score ?? score)),
        comment: String(hit?.comment ?? "").trim() || "—",
      };
    });
    return {
      score,
      grade,
      gradeLabel,
      advice,
      summary: String(parsed.summary ?? "").trim() || "已完成評分。",
      dimensions,
    };
  } catch {
    return heuristicScore(scenario, turns);
  }
}
