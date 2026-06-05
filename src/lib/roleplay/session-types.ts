import type { RoleplayGrade, RoleplayScenario, RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";

export type RoleplayChatRole = "customer" | "agent";

export type RoleplayChatTurn = {
  role: RoleplayChatRole;
  content: string;
  at: string;
};

export type RoleplayDimensionScore = {
  dimensionId: string;
  label: string;
  /** 0～20 */
  score: number;
  maxScore: number;
  comment: string;
};

export type RoleplayScoreResult = {
  score: number;
  grade: RoleplayGrade;
  gradeLabel: string;
  advice: string;
  summary: string;
  dimensions: RoleplayDimensionScore[];
  improvementTips: string[];
  unusedStrategies: string[];
  previousScore: number | null;
  scoreDelta: number | null;
};

export type RoleplaySession = {
  sessionId: string;
  scenarioId: string;
  personaId: string;
  scenario: RoleplayScenario;
  config?: RoleplaySessionConfig;
  userId: string;
  username: string;
  displayName: string;
  branch: string;
  turns: RoleplayChatTurn[];
  agentTurnCount: number;
  maxTurns: number;
  status: "active" | "finished";
  startedAt: string;
  finishedAt?: string;
  scoreResult?: RoleplayScoreResult;
  followUpIndex: number;
};
