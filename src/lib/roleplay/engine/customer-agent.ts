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
    return followUps[followUpIndex]!;
  }
  return "我了解了，不過我還是覺得需要再比較一下。你還有沒有更具體的說明？";
}

/** 給 LLM 的議題邊界（主題詞，不貼完整佐證給客戶複誦） */
function buildTopicScopeBlock(scenario: RoleplayScenario): string {
  const themes = new Set<string>();
  const patterns: { re: RegExp; label: string }[] = [
    { re: /油耗|km\/L|WLTC|油錢/i, label: "油耗與用車成本" },
    { re: /保養|定保|回廠|保修/i, label: "保養與回廠" },
    { re: /ProPILOT|輔助|安全|AEB/i, label: "安全與輔助" },
    { re: /空間|後座|行李/i, label: "空間與舒適" },
    { re: /價格|優惠|促銷|方案/i, label: "價格與方案" },
    { re: /配備|科技|隔音/i, label: "配備與科技" },
  ];
  for (const f of scenario.sectionC.facts) {
    const text = `${f.label} ${f.value}`;
    for (const p of patterns) {
      if (p.re.test(text)) themes.add(p.label);
    }
  }
  if (themes.size === 0) {
    themes.add("油耗與用車成本");
    themes.add("產品差異");
  }
  return `【本場可談主題（內部邊界，用口語發問，勿逐條背誦）】\n${[...themes].map((t) => `- ${t}`).join("\n")}`;
}

function cleanCustomerLine(text: string, fallback: string): string {
  return sanitizeCustomerUtterance(text) || fallback;
}

/** 業代消極、敷衍或未正面回應時，客戶應先表達感受而非直接跳題 */
function isPassiveAgentReply(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return true;
  return /不知道|不確定|不太清楚|沒研究|沒辦法|不清楚|不太懂|沒有資料|不太瞭解|隨便|再看看|應該吧|大概吧|差不多吧|問主管|問一下|回去查|晚點再說|這個要問/i.test(
    t,
  );
}

function passiveAgentPromptBlock(agentMessage: string, diff: ReturnType<typeof normalizeDrillDifficulty>): string {
  if (!isPassiveAgentReply(agentMessage)) return "";

  const tone =
    diff === "challenge"
      ? "語氣可較強硬，明確表示這樣的服務讓你卻步。"
      : diff === "beginner"
        ? "語氣可帶失望但仍願意給機會，請對方查清楚再說。"
        : "語氣帶失望或質疑，像真實買家會有的反應。";

  return `【業代剛才回應明顯消極、敷衍或未正面回答】
請先用 1 句表達買家真實感受（可質疑專業度／態度，如「你怎麼也不確定？」「這樣我很難比較耶」），${tone}
本輪勿直接跳去問下一個產品規格或比較題；可要求對方具體說明或重述你剛才的疑慮。`;
}

function buildSystemInstruction(
  scenario: RoleplayScenario,
  persona: RoleplayPersona,
): string {
  const skill = loadRoleplaySkill("skill_ai_customer.md");
  const diff = normalizeDrillDifficulty(scenario.sectionE.difficulty);
  const age = scenario.sectionE.ageRange ?? "30-40";
  return `${skill}

${buildTopicScopeBlock(scenario)}

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
關心：${scenario.sectionA.coreIssue}

【競品範圍】僅與 ${scenario.sectionA.competitor} 比較，勿無故改問其他品牌。`;
}

export async function generateCustomerOpening(
  scenario: RoleplayScenario,
  persona: RoleplayPersona,
  _options?: { useLlm?: boolean },
): Promise<string> {
  const scripted = scenario.sectionB.openingLine?.trim();
  const fallback = "你好，我在考慮這台車，想先了解一下。";
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

  const isFinalAgentTurn = agentTurnCount >= maxTurns;
  const nearEnd = agentTurnCount >= maxTurns - 1;
  const diff = normalizeDrillDifficulty(scenario.sectionE.difficulty);
  const passiveAgent = isPassiveAgentReply(agentMessage);
  const system = buildSystemInstruction(scenario, persona);
  const scriptedFallback = isFinalAgentTurn
    ? "好的，今天先了解到這裡，我回去跟家人討論一下再聯絡你。"
    : passiveAgent
      ? diff === "challenge"
        ? "你這樣我也不敢買耶，連基本問題都沒辦法回答嗎？"
        : "你怎麼也不太確定？這樣我很難放心比較，能不能幫我查清楚一點？"
      : fallbackCustomerReply(scenario, followUpIndex);
  const hintFollowUp = scenario.sectionB.followUps[followUpIndex];

  const prompt = `${system}

【對話紀錄】
${formatHistory(turns)}
業代（剛剛）：${agentMessage}

第 ${agentTurnCount} / ${maxTurns} 輪業代回覆。
${
  isFinalAgentTurn
    ? "【本場最後一輪】業代已用完回覆次數。請以買家口吻簡短收尾（如：今天先了解到這、要再考慮、改天再試乘），勿再提出新的技術追問或疑慮。"
    : nearEnd
      ? "業代下一輪將是最後一次回覆，可簡短補充一點疑慮，但勿連續追殺。"
      : ""
}
${passiveAgentPromptBlock(agentMessage, diff)}
${
  hintFollowUp && !isFinalAgentTurn && !passiveAgent
    ? `（內部參考方向，請改寫成自然口語，勿照念）：${hintFollowUp}`
    : ""
}

請以真實買家身份回覆 1～3 句，口語自然。不要輸出 JSON。`;

  const raw = await geminiGenerateText(prompt, {
    maxOutputTokens: 280,
    temperature: 0.78,
  });

  const text = raw?.trim();
  if (text && text.length >= 4) {
    const cleaned = cleanCustomerLine(text, "");
    if (cleaned) return cleaned;
  }

  return cleanCustomerLine(scriptedFallback, "我了解了，不過我還是覺得需要再比較一下。");
}
