import type { RoleplayChatTurn } from "@/lib/roleplay/session-types";

/**
 * 連續多則業代訊息合併成一句，評分／待加強才能對齊「客戶問 → 業代答」。
 * （舊場次可能仍為 [客戶, 業代, 業代…] 順序，新場次為業代先發 [業代, 客戶, …]）
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
