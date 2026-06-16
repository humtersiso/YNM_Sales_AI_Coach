/**
 * 業代輪次標記邏輯
 * tsx scripts/ops/test-roleplay-message-rounds.ts
 */
import {
  annotateAgentRoundsFromTurns,
  formatAgentRoundLabel,
  inferAgentRoundForNextSend,
  turnsToUiMessages,
} from "../../src/lib/roleplay/roleplay-message-rounds";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testStandardFlow() {
  const turns = [
    { role: "agent" as const, content: "您好", at: "" },
    { role: "customer" as const, content: "在看車", at: "" },
    { role: "agent" as const, content: "R1 回覆", at: "" },
    { role: "customer" as const, content: "油耗?", at: "" },
    { role: "agent" as const, content: "R2 回覆", at: "" },
    { role: "agent" as const, content: "謝謝光臨", at: "" },
  ];
  const rounds = annotateAgentRoundsFromTurns(turns, { agentClosingSent: true });
  assert(rounds.get(0) === "opening", "首則業代為開場");
  assert(rounds.get(2) === 1, "第二則業代為 R1");
  assert(rounds.get(4) === 2, "第三則業代為 R2");
  assert(rounds.get(5) === "closing", "最後業代為收尾");

  const ui = turnsToUiMessages("s1", turns, { agentClosingSent: true });
  assert(ui[0]?.agentRound === "opening", "UI 開場");
  assert(ui[2]?.agentRound === 1, "UI R1");
}

function testInferNextSend() {
  assert(
    inferAgentRoundForNextSend({ waitingForAgent: true, awaitingClosing: false, turn: 0 }) ===
      "opening",
    "等待開場",
  );
  assert(
    inferAgentRoundForNextSend({ waitingForAgent: false, awaitingClosing: false, turn: 2 }) === 3,
    "第 3 輪",
  );
  assert(
    inferAgentRoundForNextSend({ waitingForAgent: false, awaitingClosing: true, turn: 5 }) ===
      "closing",
    "收尾",
  );
}

function testLabels() {
  assert(formatAgentRoundLabel(3, 5) === "3/5", "3/5");
  assert(formatAgentRoundLabel("opening", 5) === "開場", "開場");
  assert(formatAgentRoundLabel("closing", 5) === "5/5", "收尾為滿輪");
}

function main() {
  testStandardFlow();
  testInferNextSend();
  testLabels();
  console.log("test-roleplay-message-rounds: 3/3 通過");
}

main();
