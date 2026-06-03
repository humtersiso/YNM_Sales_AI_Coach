import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import type { RoleplayPersona, RoleplayScenario } from "@/lib/roleplay/scenario-contract";
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

export async function generateCustomerOpening(
  scenario: RoleplayScenario,
  persona: RoleplayPersona,
): Promise<string> {
  return scenario.sectionB.openingLine;
}

export async function generateCustomerReply(input: {
  scenario: RoleplayScenario;
  persona: RoleplayPersona;
  turns: RoleplayChatTurn[];
  agentMessage: string;
  followUpIndex: number;
}): Promise<string> {
  const { scenario, persona, turns, agentMessage, followUpIndex } = input;

  const prompt = `你是汽車展間的潛在客戶，正在與業代對話。請用繁體中文、口語、1～3 句回覆。

【客戶人設】${persona.name}：${persona.style}
特質：${persona.traits.join("、")}
決策模式：${persona.decisionMode}

【情境】${scenario.sectionA.title}
關心：${scenario.sectionA.coreIssue}
比較車款：${scenario.sectionA.competitor}

【對話紀錄】
${formatHistory(turns)}
業代（剛剛）：${agentMessage}

請以客戶身份回覆。可適度追問或表達疑慮，不要替業代總結。不要輸出 JSON。`;

  const raw = await geminiGenerateText(prompt, {
    maxOutputTokens: 256,
    temperature: 0.7,
  });

  const text = raw?.trim();
  if (text && text.length >= 4) return text;

  return fallbackCustomerReply(scenario, followUpIndex);
}
