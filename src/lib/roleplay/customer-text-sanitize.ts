/** 客戶可見台詞：不得出現語料檔名、教練話術、內部代碼 */

const COACH_PHRASE =
  /建議先|建議您|應對|話術|業代|同理承接|策略|禁止|KB-|T33_|\.pdf|\.xlsx|\.xls|工作表|Q&A|page\s*\d|gs:\/\/|參考片段|查核提醒|回應原則/i;

const FILE_OR_SOURCE =
  /[A-Za-z0-9_-]+\.(pdf|xlsx|xls|docx?)|\(page\s*\d+\)|工作表\d*|T33_ICE|KB-[A-Z0-9-]+/gi;

/** 是否為教練／素材用語（不可當客戶開場素材） */
export function isCoachOnlySnippet(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 4) return true;
  return COACH_PHRASE.test(t);
}

/** 給業代／評分用的 RAG 標題（不給客戶念出） */
export function sanitizeCoachFactLabel(raw: string, index: number): string {
  const t = raw.trim();
  if (!t || FILE_OR_SOURCE.test(t) || COACH_PHRASE.test(t)) {
    return `重點 ${index + 1}`;
  }
  return t.slice(0, 40);
}

/** 給業代／評分用的 RAG 內容摘要 */
export function sanitizeCoachFactValue(raw: string): string {
  let t = raw.trim().replace(FILE_OR_SOURCE, "").replace(/\s+/g, " ");
  if (isCoachOnlySnippet(t)) return "";
  return t.slice(0, 400) || "—";
}

/** 客戶開場／回覆：移除檔名、教練用語 */
export function sanitizeCustomerUtterance(text: string): string {
  let t = text.trim();
  if (!t) return t;

  t = t.replace(FILE_OR_SOURCE, "");
  t = t.replace(/[「」『』""]/g, "");
  t = t.replace(/\s+/g, " ").trim();

  if (COACH_PHRASE.test(t) || t.length < 8) {
    return "";
  }
  return t;
}
