import type { RoleplayGrade, RoleplayScenario, RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";
import type { RoleplayRagCoverage } from "@/lib/roleplay/rag-context";

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

/** 待加強分類：資訊對錯 vs 銷售策略 */
export type RoleplayCorrectionCategory = "fact" | "strategy";

/** 本場對練：業代漏說／說錯處，附正確說法詳解 */
export type RoleplayCorrectionPoint = {
  /** 待補強項目（簡短標題） */
  issue: string;
  category: RoleplayCorrectionCategory;
  /** 客戶當時問的重點（供建議說法對齊 RAG） */
  customerAsk?: string;
  /** 業代實際說法摘要（可空） */
  whatYouSaid?: string;
  /** 建議正確說法（依 RAG 整理，非僅修飾原話） */
  correctGuide: string;
};

export type RoleplayScoreResult = {
  score: number;
  grade: RoleplayGrade;
  gradeLabel: string;
  advice: string;
  summary: string;
  dimensions: RoleplayDimensionScore[];
  improvementTips: string[];
  /** 本場修正點（取代舊版「未使用策略」） */
  correctionPoints: RoleplayCorrectionPoint[];
  /** 待加強 Rubric 版本（完賽寫入 BQ report_json） */
  rubricVersion?: string;
  /** @deprecated 由 correctionPoints.issue 同步，供舊報表相容 */
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
  /** 業代已完成的「計入輪次」對話回覆數（不含開場招呼與收尾致謝） */
  maxTurns: number;
  status: "active" | "finished";
  startedAt: string;
  finishedAt?: string;
  scoreResult?: RoleplayScoreResult;
  followUpIndex: number;
  /** 業代先發：客戶首句意向（尚未寫入 turns，等業代打招呼後再生成） */
  pendingCustomerOpening?: string;
  /** 對話輪次已滿，等待業代收尾致謝 */
  awaitingAgentClosing?: boolean;
  /** 業代已送出收尾致謝，可結束評分 */
  agentClosingSent?: boolean;
  ragCoverage?: RoleplayRagCoverage;
};
