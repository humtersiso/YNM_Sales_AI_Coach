export type ScriptCitation = {
  index: number;
  question: string;
  script: string;
};

const MAX_LINES = 4;
const MAX_CHARS = 320;

/** 題庫查無時的回覆（聯絡窗口可透過環境變數設定） */
export function notInQuestionBankReply(): string {
  const contact = (process.env.SALES_SCRIPT_CONTACT ?? "總部話術管理窗口").trim();
  return `目前題庫中尚無此問題的標準話術，暫無法提供建議回覆。請聯絡「${contact}」協助新增後再查詢。`;
}

/** 壓縮為約 3～4 行，供氣泡主文顯示 */
export function summarizeToBrief(text: string, maxLines = MAX_LINES, maxChars = MAX_CHARS): string {
  const cleaned = text.replace(/\[object Object\]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const sentences = cleaned
    .split(/(?<=[。！？!?])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);

  if (sentences.length > 0) {
    let out = "";
    let lines = 0;
    for (const s of sentences) {
      if (lines >= maxLines) break;
      const next = out + s;
      if (next.length > maxChars) break;
      out = next;
      lines += 1;
    }
    if (out) return out;
  }

  if (cleaned.length <= maxChars) return cleaned;
  const cut = cleaned.slice(0, maxChars);
  const lastPause = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("，"), cut.lastIndexOf(" "));
  return (lastPause > 80 ? cut.slice(0, lastPause) : cut).trim() + "…";
}

export function isUsableReply(text: string): boolean {
  const t = text.trim();
  if (!t || t.includes("[object Object]")) return false;
  return true;
}

/** 僅在已確認題庫有資料時使用，自 BQ 話術摘錄簡短回覆 */
export function buildBriefReplyFromCitations(citations: ScriptCitation[]): string {
  const primary = citations.find((c) => c.script && c.script.length > 10);
  if (!primary) return "";
  return summarizeToBrief(primary.script);
}

export function isValidCitation(c: ScriptCitation): boolean {
  return Boolean(c.script?.trim() && c.script.length > 10 && c.script !== "（無建議話術）");
}
