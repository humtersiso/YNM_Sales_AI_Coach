import type { RoleplayDrillDifficulty, RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";
import type { RoleplayCorrectionPoint, RoleplayDimensionScore } from "@/lib/roleplay/session-types";

export type RoleplayDimensionAverages = {
  empathy: number | null;
  structure: number | null;
  factCheck: number | null;
  strategy: number | null;
  advance: number | null;
};

export type RoleplayScoreTrendPoint = {
  sessionId: string;
  completedAt: string;
  score: number;
};

export type RoleplayHistoryItem = {
  sessionId: string;
  status: "COMPLETED" | "STARTED";
  /** 開局時間（ISO） */
  startedAt: string;
  /** 完成日期時間（未完賽為 null） */
  completedAt: string | null;
  targetModel: string;
  competitor: string;
  customerType: string;
  customerTypeName: string;
  ageRange: string;
  difficulty: RoleplayDrillDifficulty | string;
  difficultyLabel: string;
  score: number | null;
  grade: string;
  summary: string;
  dimensions: RoleplayDimensionScore[];
  improvementTips: string[];
  correctionPoints: RoleplayCorrectionPoint[];
  unusedStrategies: string[];
  /** 開局設定（完賽後供「同情境再練」） */
  sessionConfig?: RoleplaySessionConfig;
};

export type RoleplayDashboardBriefing = {
  strengthLine: string;
  weaknessLine: string;
  trendLine: string;
  adviceLine: string;
  /** 具體數字／事實記憶點（2～3 條），方便反覆記憶 */
  knowledgeLines?: string[];
};

export type RoleplayDashboardStats = {
  /** 開局場次（含未完成） */
  startedSessions: number;
  /** 完賽場次 */
  completedSessions: number;
  /** @deprecated 同 completedSessions */
  totalSessions: number;
  overallAvg: number;
  /** 近 N 場五維均分加總（與雷達軸標籤加總一致） */
  radarOverallAvg: number;
  /** 近 N 場總分（score_total）平均，與 lastScore 同尺度 */
  recentTotalAvg: number;
  lastScore: number | null;
  strongestDimensions: string[];
  byDifficulty: {
    difficulty: RoleplayDrillDifficulty;
    label: string;
    avgScore: number;
    count: number;
  }[];
  dimensionAverages: RoleplayDimensionAverages | null;
  weakestDimensions: string[];
  dimensionLabels: Record<string, string>;
  scoreTrend: RoleplayScoreTrendPoint[];
  briefing: RoleplayDashboardBriefing | null;
  /** 戰績已變但背景小結尚未寫入 BQ 時為 true */
  briefingStale?: boolean;
  suggestions: {
    label: string;
    personaId: string;
    difficulty: string;
    competitor: string;
    reason: string;
  }[];
  /** 供小結 LLM 使用的待記憶知識點原文（首頁不直接顯示） */
  knowledgeReminders?: string[];
  /** 近五場「本場待加強」列點（資訊對錯 + 銷售策略，規則產出） */
  correctionMemoryLines?: string[];
  /** 近五場僅「資訊對錯」含數字句（供小結 LLM 素材） */
  factMemoryLines?: string[];
  /** 近五場「銷售策略」彙整的建議；無則「無」 */
  strategyAdviceFromCorrections?: string;
};
