import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import { sanitizeCustomerUtterance } from "@/lib/roleplay/customer-text-sanitize";
import type { RoleplayPersona, RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import {
  ageRangePrompt,
  difficultyBehaviorPrompt,
  normalizeDrillDifficulty,
} from "@/lib/roleplay/engine/difficulty-behavior";
import { loadRoleplaySkill } from "@/lib/roleplay/skills/load-skill";
import type { RoleplayChatTurn } from "@/lib/roleplay/session-types";

function formatHistory(turns: RoleplayChatTurn[]): string {
  if (turns.length === 0) return "（尚無對話）";
  return turns
    .map((t) => `${t.role === "customer" ? "客戶" : "業代"}：${t.content}`)
    .join("\n");
}

function fallbackCustomerReply(
  scenario: RoleplayScenario,
  followUpIndex: number,
): string {
  const followUps = scenario.sectionB.followUps;
  if (followUpIndex < followUps.length) {
    return followUps[followUpIndex];
  }
  return "我了解了，不過我還是覺得需要再比較一下。你還有沒有更具體的說明？";
}

function buildRagContextBlock(scenario: RoleplayScenario): string {
  const facts = scenario.sectionC.facts
    .filter((f) => f.value && f.value !== "—")
    .map((f) => `- ${f.label}：${f.value}`)
    .join("\n");
  return `【背景（僅供理解客戶心理，勿向業代提及檔名、話術表或教練指引）】\n${facts || "（無）"}`;
}

function cleanCustomerLine(text: string, fallback: string): string {
  return sanitizeCustomerUtterance(text) || fallback;
}

function buildSystemInstruction(
  scenario: RoleplayScenario,
  persona: RoleplayPersona,
): string {
  const skill = loadRoleplaySkill("skill_ai_customer.md");
  const diff = normalizeDrillDifficulty(scenario.sectionE.difficulty);
  const age = scenario.sectionE.ageRange ?? "30-40";
  return `${skill}

${buildRagContextBlock(scenario)}

${sessionContextBlock(scenario, persona, diff, age)}`;
}

function sessionContextBlock(
  scenario: RoleplayScenario,
  persona: RoleplayPersona,
  diff: ReturnType<typeof normalizeDrillDifficulty>,
  age: string,
): string {
  return `【客戶人設】${persona.name}（${persona.id}）：${persona.style}
特質：${persona.traits.join("、")}
決策模式：${persona.decisionMode}
${ageRangePrompt(age)}
${difficultyBehaviorPrompt(diff)}

【情境】${scenario.sectionA.title}
比較：${scenario.sectionA.competitor} vs ${scenario.sectionA.productDisplayName}
關心：${scenario.sectionA.coreIssue}`;
}

/**
 * 開場：dyn 情境已在 compose 時依 RAG+人設產生；示範 KB-T33 可再潤飾一層 LLM。
 */
export async function generateCustomerOpening(
  scenario: RoleplayScenario,
  persona: RoleplayPersona,
  options?: { useLlm?: boolean },
): Promise<string> {
  const scripted = scenario.sectionB.openingLine?.trim();
  const fallback = "你好，我在考慮這台車，想先了解一下。";
  if (!options?.useLlm) {
    return cleanCustomerLine(scripted ?? "", fallback);
  }

  const prompt = `${buildSystemInstruction(scenario, persona)}

請以客戶身份說出開場 1～2 句（可改寫但需保留原議題方向）。參考：${scripted}`;

  const raw = await geminiGenerateText(prompt, {
    maxOutputTokens: 200,
    temperature: 0.75,
  });
  const text = raw?.trim();
  if (text && text.length >= 6) {
    return cleanCustomerLine(text, cleanCustomerLine(scripted ?? "", fallback));
  }
  return cleanCustomerLine(scripted ?? "", fallback);
}

export async function generateCustomerReply(input: {
  scenario: RoleplayScenario;
  persona: RoleplayPersona;
  turns: RoleplayChatTurn[];
  agentMessage: string;
  followUpIndex: number;
  agentTurnCount: number;
  maxTurns: number;
}): Promise<string> {
  const {
    scenario,
    persona,
    turns,
    agentMessage,
    followUpIndex,
    agentTurnCount,
    maxTurns,
  } = input;

  const nearEnd = agentTurnCount >= maxTurns - 1;
  const system = buildSystemInstruction(scenario, persona);

  const prompt = `${system}

【對話紀錄】
${formatHistory(turns)}
業代（剛剛）：${agentMessage}

第 ${agentTurnCount} / ${maxTurns} 輪業代回覆。
${nearEnd ? "這是最後一輪業代發言，可總結疑慮或表示要再考慮，勿突然成交。" : ""}

請以客戶身份回覆 1～3 句。不要輸出 JSON。`;

  const raw = await geminiGenerateText(prompt, {
    maxOutputTokens: 256,
    temperature: 0.7,
  });

  const text = raw?.trim();
  if (text && text.length >= 4) {
    const cleaned = cleanCustomerLine(text, "");
    if (cleaned) return cleaned;
  }

  return cleanCustomerLine(
    fallbackCustomerReply(scenario, followUpIndex),
    "我了解了，不過我還是覺得需要再比較一下。",
  );
}
