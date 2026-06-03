/**
 * 僅供 Client Component 使用（勿 import citation-utils / knowledge-search）。
 */

export type CitationCard = {
  id: number;
  title: string;
  page: string;
  excerpt: string;
};

/** 前端預覽折疊長度；完整原文仍在 excerpt */
export const CITATION_EXCERPT_PREVIEW_CHARS = 380;

/** 正文顯示用：移除 [1][2] 標記，引用改在文末「引用來源」區 */
export function stripInlineCitationMarkers(text: string): string {
  return text.replace(/\s*\[\d{1,2}\]/g, "").trim();
}
