/**
 * 訓練素材文字正規化與亂碼偵測（匯入前、稽核腳本共用邏輯）
 */

/** 將 PPT/PDF/Excel 常見控制字元轉為可讀換行 */
export function normalizeKnowledgeText(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u000b/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .replace(/\uFFFD/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 是否像 zip/二進位誤讀或不可讀內容 */
export function isGarbledText(text: string | null | undefined): boolean {
  const t = normalizeKnowledgeText(text);
  if (!t || t.length < 4) return false;
  if (t.startsWith("PK") && (t.includes("[Content_Types]") || t.includes("xmlschemas"))) return true;
  if (t.includes("[Content_Types].xml") || t.includes("_rels/.rels")) return true;
  const replacement = (t.match(/\uFFFD/g) || []).length;
  if (replacement > 2) return true;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const printable = (t.match(/[\u4e00-\u9fffA-Za-z0-9\s，。、？！：；「」（）\-_%]/g) || []).length;
  if (t.length > 40 && cjk === 0 && printable / t.length < 0.35) return true;
  return false;
}
