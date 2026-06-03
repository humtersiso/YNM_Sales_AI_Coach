import type { ScriptCitation } from "@/lib/gemini/reply-format";

export type SalesChatResult = {
  reply: string;
  bullets: string[];
  citations: ScriptCitation[];
  inQuestionBank: boolean;
  allowAddRequest?: boolean;
  question?: string;
};

export type SalesChatStreamEvent =
  | { type: "status"; text: string }
  | { type: "intro_delta"; text: string }
  | { type: "done"; result: SalesChatResult }
  | { type: "error"; message: string };
