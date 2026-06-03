import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import type { ScriptCitation } from "@/lib/gemini/reply-format";

/** 前端引用區塊固定標籤 */
export const CITATION_SECTION_TITLE = "引用來源";
export const CITATION_SOURCE_LABEL = "來源標題";
export const CITATION_CONTENT_LABEL = "來源內容";

export type CitationSourceKind =
  | "customer_question"
  | "document"
  | "media"
  | "video"
  | "competitor"
  | "product_info"
  | "general";

export type CitationDisplayLabels = {
  sourceKind: CitationSourceKind;
  sourceLabel: string;
  scriptLabel: string;
};

const FILE_EXT = /\.(pdf|pptx|xlsx|xls|docx|ppt)\b/i;
const LOCATOR = /\((slide|page|sheet|row|頁|投影片)\s*[\d,、\-–]+\)/i;

function isDocumentLocator(text: string): boolean {
  const t = text.trim();
  return FILE_EXT.test(t) || LOCATOR.test(t);
}

function looksLikeCustomerQuestion(text: string): boolean {
  const t = text.trim();
  if (!t || isDocumentLocator(t)) return false;
  if (t.length > 72) return false;
  return /[？?吗嗎呢]|怎麼|如何|會不會|好不好|太貴|擔心|覺得|不好|異音|油耗|特色|配備/.test(t);
}

function inferFromQuestionText(question: string): Partial<CitationDisplayLabels> {
  const q = question.trim();
  if (/媒體|報導|評測|carexpert|u-?car|試駕/i.test(q)) {
    return { sourceKind: "media", sourceLabel: "媒體報導", scriptLabel: "報導摘要" };
  }
  if (/yt|負評|youtube|youtu\.be|影片/i.test(q)) {
    return { sourceKind: "video", sourceLabel: "影片素材", scriptLabel: "重點摘要" };
  }
  if (/對戰|比較表|競品|vs\b/i.test(q)) {
    return { sourceKind: "competitor", sourceLabel: "對戰資料", scriptLabel: "對戰重點" };
  }
  if (isDocumentLocator(q)) {
    return { sourceKind: "document", sourceLabel: "素材來源", scriptLabel: "重點摘要" };
  }
  if (looksLikeCustomerQuestion(q)) {
    return { sourceKind: "customer_question", sourceLabel: "客戶問", scriptLabel: "建議話術" };
  }
  return {};
}

function inferFromMaterialCategory(
  category: MaterialCategory | string | undefined,
): Partial<CitationDisplayLabels> {
  switch (category) {
    case "sales_script":
      return { sourceKind: "customer_question", sourceLabel: "客戶問", scriptLabel: "建議話術" };
    case "competitor_compare":
      return { sourceKind: "competitor", sourceLabel: "競品議題", scriptLabel: "對戰重點" };
    case "product_info":
      return { sourceKind: "product_info", sourceLabel: "本品資訊", scriptLabel: "重點摘要" };
    default:
      return { sourceKind: "general", sourceLabel: "來源標題", scriptLabel: "內容摘要" };
  }
}

/** 依 customer_question 與 material_category 推斷引用區塊標籤 */
export function inferCitationLabels(
  question: string,
  materialCategory?: string | null,
): CitationDisplayLabels {
  const fromText = inferFromQuestionText(question);
  const fromCat = inferFromMaterialCategory(materialCategory ?? undefined);

  // 文字型態（檔名、媒體、口語問句）優先於 category
  if (fromText.sourceKind && fromText.sourceKind !== "general") {
    return {
      sourceKind: fromText.sourceKind,
      sourceLabel: fromText.sourceLabel ?? fromCat.sourceLabel ?? "來源標題",
      scriptLabel: fromText.scriptLabel ?? fromCat.scriptLabel ?? "內容摘要",
    };
  }

  if (materialCategory === "sales_script" && looksLikeCustomerQuestion(question)) {
    return {
      sourceKind: "customer_question",
      sourceLabel: "客戶問",
      scriptLabel: "建議話術",
    };
  }

  if (materialCategory === "sales_script" && isDocumentLocator(question)) {
    return {
      sourceKind: "document",
      sourceLabel: "素材來源",
      scriptLabel: "建議話術",
    };
  }

  return {
    sourceKind: fromCat.sourceKind ?? "general",
    sourceLabel: fromCat.sourceLabel ?? "來源標題",
    scriptLabel: fromCat.scriptLabel ?? "內容摘要",
  };
}

export function enrichCitation(
  citation: ScriptCitation,
  materialCategory?: string | null,
): ScriptCitation {
  const labels = inferCitationLabels(citation.question, materialCategory ?? citation.materialCategory);
  return {
    ...citation,
    sourceKind: citation.sourceKind ?? labels.sourceKind,
    sourceLabel: CITATION_SOURCE_LABEL,
    scriptLabel: CITATION_CONTENT_LABEL,
    materialCategory: citation.materialCategory ?? materialCategory ?? undefined,
  };
}

export function enrichCitations(
  citations: ScriptCitation[],
  materialCategory?: string | null,
): ScriptCitation[] {
  return citations.map((c) => enrichCitation(c, c.materialCategory ?? materialCategory));
}
