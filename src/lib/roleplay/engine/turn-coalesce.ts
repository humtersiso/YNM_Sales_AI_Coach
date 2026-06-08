import type { RoleplayChatTurn } from "@/lib/roleplay/session-types";

/**
 * 業代先發時 turns 可能為 [客戶開場, 業代招呼, 業代正文, 客戶…]。
 * 評分／待加強須將連續業代訊息合併成一句，才能對齊「客戶問 → 業代答」。
 */
export function coalesceAdjacentAgentTurns(turns: RoleplayChatTurn[]): RoleplayChatTurn[] {
  const out: RoleplayChatTurn[] = [];
  let agentParts: string[] = [];
  let agentAt = "";

  const flushAgent = () => {
    if (agentParts.length === 0) return;
    out.push({
      role: "agent",
      content: agentParts.join("\n"),
      at: agentAt || new Date().toISOString(),
    });
    agentParts = [];
    agentAt = "";
  };

  for (const t of turns) {
    if (t.role === "agent") {
      agentParts.push(t.content);
      if (!agentAt) agentAt = t.at;
    } else {
      flushAgent();
      out.push(t);
    }
  }
  flushAgent();
  return out;
}
