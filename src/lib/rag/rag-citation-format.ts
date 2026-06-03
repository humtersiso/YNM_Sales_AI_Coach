import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";

const BOILERPLATE =
  /All rights reserved|All right reserved|Confidentiality Classification:\s*Confidential|Confidentiality Classification|Do not use without any permission|Yulon Nissan|Yulon NISSAN|Motor Co\.,?\s*Ltd\.?/gi;

/** 移除 PDF/PPT 版權與浮水印雜訊 */
export function stripRagBoilerplate(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(BOILERPLATE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looseNeedles(message: string): string[] {
  const raw = message.replace(/[^\u4e00-\u9fffA-Za-z0-9\s-]/g, " ").trim();
  const out = new Set<string>();
  if (raw.length >= 2) out.add(raw);
  for (const t of raw.split(/\s+/)) {
    if (t.length >= 2) out.add(t);
  }
  return [...out].sort((a, b) => b.length - a.length).slice(0, 8);
}

/** 非 QA 表格列：精簡引用摘錄供 UI 顯示 */
export function compactCitationScript(message: string, snippet: string, maxLen = 380): string {
  const cleaned = stripRagBoilerplate(snippet);
  if (!cleaned) return "";

  const oralQ = extractCustomerQuestionFromRagSnippet(cleaned);
  if (oralQ && oralQ.length <= maxLen && /[？?]/.test(oralQ)) {
    return oralQ;
  }

  const needles = looseNeedles(message);
  let bestIdx = -1;
  let bestNeedle = "";
  for (const n of needles) {
    const idx = cleaned.toLowerCase().indexOf(n.toLowerCase());
    if (idx >= 0 && n.length >= bestNeedle.length) {
      bestIdx = idx;
      bestNeedle = n;
    }
  }

  let slice: string;
  if (bestIdx >= 0) {
    const start = Math.max(0, bestIdx - 60);
    const end = Math.min(cleaned.length, bestIdx + bestNeedle.length + maxLen - 80);
    slice = cleaned.slice(start, end).trim();
  } else {
    slice = cleaned.slice(0, maxLen).trim();
  }

  if (slice.length > maxLen) slice = `${slice.slice(0, maxLen - 1)}…`;
  return slice;
}

/** 從 RAG 話術 PDF 表格摘錄中抽出「客戶疑問」列（供 rerank / 引用標題） */
export function extractCustomerQuestionFromRagSnippet(snippet: string): string | null {
  const t = snippet.replace(/\r\n/g, "\n");
  // 表格列：… 客戶疑問 (問) … 實際問句
  const rowMatch = t.match(
    /客戶疑問\s*[\(（]?問[\)）]?\s*[:：]?\s*([^\n\r]{8,120})/,
  );
  if (rowMatch?.[1]) {
    const q = rowMatch[1].trim().split(/\s{2,}/)[0]?.trim();
    if (q && q.length >= 6) return q.slice(0, 120);
  }
  const oralQ = t.match(
    /((?:為什麼|為何|是不是|會不會|有沒有|怎麼|如何|請問|你們|我|這|那)[^?？\n]{4,100}[?？])/,
  );
  if (oralQ?.[1]) return oralQ[1].trim().slice(0, 120);
  // 整段以口語問句開頭
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length < 8 || line.length > 100) continue;
    if (/[？?]|怎麼|如何|嗎|呢|覺得|擔心|為什麼|為何/.test(line) && !/\.pdf|Do not use/i.test(line)) {
      return line.slice(0, 120);
    }
  }
  return null;
}

export function formatRagSourceTitle(
  fileName: string,
  page?: { first?: number; last?: number },
): string {
  const base = fileName.trim() || "RAG 片段";
  const p = page?.first ?? page?.last;
  if (p != null && p > 0) {
    const last = page?.last;
    if (last != null && last !== p) return `${base} (page ${p}-${last})`;
    return `${base} (page ${p})`;
  }
  return base;
}

export function enrichRagChunkHit(hit: RagChunkHit): RagChunkHit {
  const cq = extractCustomerQuestionFromRagSnippet(hit.snippet);
  const fileTitle = hit.title;
  const displayTitle = cq
    ? `${cq.slice(0, 80)} · ${fileTitle.replace(/\.pdf$/i, "")}`
    : fileTitle;
  return {
    ...hit,
    title: displayTitle,
    productLine: hit.productLine,
  };
}
