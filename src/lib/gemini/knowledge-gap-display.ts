/** 知識庫缺資料／無法對照類提醒（UI 紅字） */
export type KnowledgeGapSegment = {
  text: string;
  gap: boolean;
};

/** 單句或整段是否為「知識庫無資料」類提醒 */
export function isKnowledgeGapNoticeText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/知識庫(中)?(並無|沒有|尚無|目前僅|無法)/.test(t)) return true;
  if (/並無.{0,120}(數據|資料|話術|建檔|對照|比較|說明|內容|文件)/.test(t)) return true;
  if (
    /無法依建檔資料|無法與其他車款進行|目前題庫中尚無|目前知識庫尚無|此問題與目前話術知識庫內容不符/.test(
      t,
    )
  ) {
    return true;
  }
  if (/查無.{0,40}(數據|資料|話術)/.test(t)) return true;
  return false;
}

/** 依句號／換行切段，標記需紅字提醒的句子 */
export function segmentKnowledgeGapText(text: string): KnowledgeGapSegment[] {
  const t = text.trim();
  if (!t) return [];

  const parts = t.split(/(?<=[。！？])\s*|\n+/).filter((p) => p.trim().length > 0);
  if (parts.length === 0) {
    return [{ text: t, gap: isKnowledgeGapNoticeText(t) }];
  }

  return parts.map((part) => {
    const piece = part.trim();
    return { text: piece, gap: isKnowledgeGapNoticeText(piece) };
  });
}
