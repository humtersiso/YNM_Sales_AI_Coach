export type QuestionStatus = "duplicate" | "pending_clarification";
export type NotifyStatus = "sent" | "failed";

export interface Expert {
  id: string;
  code: string | null;
  name: string;
  email: string;
  groupName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  level1: string;
  level2: string;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  source: string | null;
  originalText: string;
  normalizedText: string;
  status: QuestionStatus;
  isDuplicate: boolean;
  duplicateOfId: string | null;
  suggestedReply: string;
  /** 法務／前線用單段標準話術摘要（可來自 Excel 欄位或系統合併產生） */
  standardScript: string | null;
  legalStatus: "none" | "pending_review" | "approved" | "rejected";
  legalComments: string | null;
  duplicateScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionTag {
  id: string;
  questionId: string;
  tagId: string;
  createdAt: string;
}

export interface ExpertSuggestion {
  id: string;
  questionId: string;
  expertId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  questionId: string;
  expertId: string;
  status: NotifyStatus;
  message: string | null;
  createdAt: string;
}

export interface AppState {
  workbookPath: string;
  experts: Expert[];
  tags: Tag[];
  questions: Question[];
  questionTags: QuestionTag[];
  expertSuggestions: ExpertSuggestion[];
  notifications: Notification[];
}
