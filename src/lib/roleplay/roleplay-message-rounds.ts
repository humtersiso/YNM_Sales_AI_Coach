import type { RoleplayChatTurn } from "@/lib/roleplay/session-types";

/** 業代發言輪次；開場／收尾不計入或另標 */
export type RoleplayAgentRound = number | "opening" | "closing";

export function formatAgentRoundLabel(round: RoleplayAgentRound, maxTurns: number): string {
  const max = Math.max(1, maxTurns);
  if (round === "opening") return "開場";
  if (round === "closing") return `${max}/${max}`;
  return `${round}/${max}`;
}

/** 下一則業代送出訊息應標記的輪次 */
export function inferAgentRoundForNextSend(input: {
  waitingForAgent: boolean;
  awaitingClosing: boolean;
  turn: number;
}): RoleplayAgentRound {
  if (input.waitingForAgent) return "opening";
  if (input.awaitingClosing) return "closing";
  return input.turn + 1;
}

/** 依 turns 順序為每則業代發言標記輪次（與後端 agentTurnCount 一致） */
export function annotateAgentRoundsFromTurns(
  turns: Pick<RoleplayChatTurn, "role">[],
  opts: { agentClosingSent: boolean },
): Map<number, RoleplayAgentRound> {
  const out = new Map<number, RoleplayAgentRound>();
  const agentClosingSent = opts.agentClosingSent;
  const hasOpening = turns[0]?.role === "agent";
  let dialogueRound = 0;
  let agentSeen = 0;

  const agentIndices: number[] = [];
  turns.forEach((t, i) => {
    if (t.role === "agent") agentIndices.push(i);
  });

  for (const idx of agentIndices) {
    agentSeen++;
    const isLastAgent = idx === agentIndices[agentIndices.length - 1];
    const isFirstAgent = agentSeen === 1;

    if (agentClosingSent && isLastAgent) {
      out.set(idx, "closing");
    } else if (hasOpening && isFirstAgent) {
      out.set(idx, "opening");
    } else {
      dialogueRound += 1;
      out.set(idx, dialogueRound);
    }
  }

  return out;
}

export function turnsToUiMessages(
  sessionId: string,
  turns: RoleplayChatTurn[],
  opts: { agentClosingSent: boolean },
): {
  id: string;
  role: "customer" | "agent";
  content: string;
  agentRound?: RoleplayAgentRound;
}[] {
  const rounds = annotateAgentRoundsFromTurns(turns, opts);
  return turns.map((t, i) => ({
    id: `${sessionId}-${i}`,
    role: t.role,
    content: t.content,
    ...(t.role === "agent" ? { agentRound: rounds.get(i) } : {}),
  }));
}
