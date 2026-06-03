import type { CitationCard } from "@/lib/gemini/citation-display";

export type SalesChatResult = {
  reply: string;
  bullets: string[];
  citations: CitationCard[];
  /** 未顯示的引用筆數（UI 以 +N 呈現） */
  citationsOverflow?: number;
  inQuestionBank: boolean;
  allowAddRequest?: boolean;
  question?: string;
};

export type SalesChatStreamEvent =
  | { type: "status"; text: string }
  | {
      type: "citations_ready";
      citations: CitationCard[];
      citationsOverflow?: number;
    }
  | { type: "intro_delta"; text: string }
  | { type: "done"; result: SalesChatResult }
  | { type: "error"; message: string };
