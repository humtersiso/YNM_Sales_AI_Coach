export type AssistantType = "sales" | "roleplay";

export type QueryLog = {
  id: string;
  question: string;
  replySummary: string;
  fullReply: string;
  askedAt: string;
  branch: string;
  agentName: string;
  tenureYears: number;
  assistantType: AssistantType;
  isCompetitor?: boolean;
  competitorTags?: string[];
  dedupCluster?: string;
  dedupPairId?: string;
  questionKind?: "bank" | "new";
};

export type AgentLeaderboardRow = {
  id: string;
  name: string;
  branch: string;
  tenureYears: number;
  usageScore: number;
  performanceScore: number;
  compositeScore: number;
};

export type BranchLeaderboardCard = {
  branch: string;
  topThree: AgentLeaderboardRow[];
};

export type RoleplayLog = {
  id: string;
  scenario: string;
  outcome: string;
  score: number;
  durationMin: number;
  practicedAt: string;
  branch: string;
  agentName: string;
  tenureYears: number;
};

export type UsageFilters = {
  branch?: string;
  tenureMin?: number;
  tenureMax?: number;
  assistantType?: AssistantType | "all";
  dateFrom?: string;
  dateTo?: string;
};
