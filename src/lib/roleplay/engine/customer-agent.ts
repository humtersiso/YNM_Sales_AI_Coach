import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import { sanitizeCustomerUtterance } from "@/lib/roleplay/customer-text-sanitize";
import type { RoleplayPersona, RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import {
  ageRangePrompt,
  difficultyBehaviorPrompt,
  normalizeDrillDifficulty,
} from "@/lib/roleplay/engine/difficulty-behavior";
import { isAgentStrategyDeferReply } from "@/lib/roleplay/engine/correction-builder";
import { normalizeCompetitorToken } from "@/lib/roleplay/engine/correction-guide";
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

type DrillDifficulty = ReturnType<typeof normalizeDrillDifficulty>;

/** 業代消極、敷衍或未正面回應時，客戶應先表達感受而非直接跳題 */
function isPassiveAgentReply(text: string): boolean {
  const t = text.trim();
  if (isAgentStrategyDeferReply(t)) return true;
  if (t.length < 12) return true;
  return /不知道|不確定|不太清楚|沒研究|沒辦法|不清楚|不太懂|沒有資料|不太瞭解|隨便|再看看|應該吧|大概吧|差不多吧|問主管|問一下|回去查|晚點再說|這個要問/i.test(
    t,
  );
}

function deferAgentScriptedFallback(diff: DrillDifficulty): string {
  if (diff === "challenge") {
    return "我今天是來比數字的，不是只想加 LINE。你至少先跟我說個大概範圍吧？";
  }
  if (diff === "beginner") {
    return "加 LINE 可以，但那至少先跟我說個大概範圍？我今天想先比較數字。";
  }
  return "那至少先跟我說個大概範圍？我今天是想比數字，不是只想加 LINE。";
}

function deferAgentPromptBlock(agentMessage: string, diff: DrillDifficulty): string {
  if (!isAgentStrategyDeferReply(agentMessage)) return "";

  const tone =
    diff === "challenge"
      ? "語氣可較直接，明確表示只想加聯絡方式無法接受。"
      : diff === "beginner"
        ? "語氣可委婉，但仍要求當場給方向或粗估。"
        : "語氣像真實買家，帶失望或質疑。";

  return `【業代剛才延後提供資訊（如加 LINE、內部確認、稍後回覆、試乘才給表），未當場回答你的疑慮】
請先針對「延後」本身反應，禁止只說「了解了、再比較一下」就結束。
可改寫例如：「那至少先跟我說個大概範圍？」「我今天是想比數字，不是只想加 LINE。」
${tone}
須呼應業代剛才的說法（LINE／內部確認等），再要求當場給粗估或說明邏輯。`;
}

function passiveAgentPromptBlock(agentMessage: string, diff: DrillDifficulty): string {
  if (isAgentStrategyDeferReply(agentMessage)) return "";
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

function mergeGreetingWithOpening(agentMessage: string, plannedOpening: string): string {
  const opening = plannedOpening.trim();
  if (!opening) return "您好，我在考慮這台車，想先了解一下。";
  if (/^(你好|您好|嗨)/.test(opening)) return opening;
  if (/你好|您好|歡迎|請問|在看|需要什麼/.test(agentMessage)) {
    const body = opening.replace(/^(你好|您好)[，,]?\s*/, "");
    return cleanCustomerLine(`您好，${body}`, opening);
  }
  return opening;
}

/** 業代先打招呼後，客戶第一句（須接住業代開場，再帶出比較／購車意向） */
export async function generateCustomerFirstReply(input: {
  scenario: RoleplayScenario;
  persona: RoleplayPersona;
  agentMessage: string;
  plannedOpening: string;
}): Promise<string> {
  const { scenario, persona, agentMessage, plannedOpening } = input;
  const scriptedFallback = mergeGreetingWithOpening(agentMessage, plannedOpening);
  const system = buildSystemInstruction(scenario, persona);

  const prompt = `${system}

【規則 — 客戶第一句】
業代剛先開口，你是客戶第一次回應。
1. 須先簡短接住業代的招呼（呼應對方說的話，不要無視）。
2. 再自然帶出本場購車／比較意向（改寫成口語，勿照念）。
3. 本場核心意向（內部參考）：${plannedOpening}
4. 不可像客戶比業代更早進場、直接丟問題而沒回應業代。

業代：${agentMessage}

請以真實買家身份回覆 1～2 句，口語自然。不要輸出 JSON。`;

  const raw = await geminiGenerateText(prompt, {
    maxOutputTokens: 220,
    temperature: 0.72,
  });

  const text = raw?.trim();
  if (text && text.length >= 8) {
    const cleaned = cleanCustomerLine(text, "");
    if (cleaned) return cleaned;
  }

  return scriptedFallback;
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
  const deferAgent = isAgentStrategyDeferReply(agentMessage);
  const passiveAgent = isPassiveAgentReply(agentMessage);
  const system = buildSystemInstruction(scenario, persona);
  const scriptedFallback = isFinalAgentTurn
    ? "好的，今天先了解到這裡，我回去跟家人討論一下再聯絡你。"
    : deferAgent
      ? deferAgentScriptedFallback(diff)
      : passiveAgent
        ? diff === "challenge"
          ? "你這樣我也不敢買耶，連基本問題都沒辦法回答嗎？"
          : "你怎麼也不太確定？這樣我很難放心比較，能不能幫我查清楚一點？"
        : fallbackCustomerReply(scenario, followUpIndex);
  const hintFollowUp = scenario.sectionB.followUps[followUpIndex];
  const shortComp = normalizeCompetitorToken(scenario.sectionA.competitor);
  const competitorGuardrail =
    turns.some(
      (t) =>
        t.role === "customer" &&
        /怎麼一直|一直拿|我問的是|首選對手|都在講|跳開|避重就輕/i.test(t.content),
    ) || /RAV4|Sportage|Tucson|Outlander/i.test(agentMessage)
      ? `【內部提醒 — 客戶已強調要比較 ${shortComp}】客戶下一輪若仍不滿意，可質疑業代是否迴避 ${shortComp} 比較；勿改問其他品牌。`
      : "";

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
${deferAgentPromptBlock(agentMessage, diff)}
${passiveAgentPromptBlock(agentMessage, diff)}
${competitorGuardrail}
${
  hintFollowUp && !isFinalAgentTurn && !passiveAgent && !deferAgent
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

  const ultimateFallback = deferAgent
    ? deferAgentScriptedFallback(diff)
    : "我了解了，不過我還是覺得需要再比較一下。";
  return cleanCustomerLine(scriptedFallback, ultimateFallback);
}
