export type AssistantType = "sales" | "roleplay";

export type QueryLog = {
  id: string;
  userId: string;
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
  /** platform_users.user_id；篩選單一業代 */
  agentUserId?: string;
};

export type RoleplayAdminSession = {
  sessionId: string;
  userId: string;
  displayName: string;
  username: string;
  branch: string;
  status: "COMPLETED" | "STARTED";
  targetModel: string;
  competitor: string;
  personaId: string;
  difficulty: string;
  score: number | null;
  grade: string;
  startedAt: string;
  finishedAt: string | null;
  durationMin: number | null;
};

export type RoleplayAgentSummary = {
  userId: string;
  displayName: string;
  username: string;
  branch: string;
  completedCount: number;
  startedIncomplete: number;
  avgScore: number | null;
  lastCompletedAt: string | null;
};

export type RoleplayUsageKpis = {
  activeAgents: number;
  completedSessions: number;
  startedIncomplete: number;
  avgScore: number | null;
};

export type AgentNameOption = {
  userId: string;
  displayName: string;
  username: string;
  branch: string;
};
