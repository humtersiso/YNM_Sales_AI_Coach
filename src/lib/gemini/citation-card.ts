import type { ScriptCitation } from "@/lib/gemini/reply-format";
import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";
import type { CitationCard } from "@/lib/gemini/citation-display";
import { pdfNameFromHit, stripRagBoilerplate } from "@/lib/rag/rag-citation-format";

export type { CitationCard };

const GS_PREFIX = /^gs:\/\/[^/]+\//;

export function parseCitationSourceParts(
  rawTitle: string,
  pageOverride?: string,
): { title: string; page: string } {
  let t = rawTitle.trim();
  if (!t) return { title: "參考資料", page: pageOverride ?? "—" };

  const pageMatch = t.match(/\(page\s+(\d+(?:-\d+)?)\)/i);
  let page = pageOverride ?? "";
  if (!page && pageMatch?.[1]) {
    page = `第 ${pageMatch[1].replace("-", "–")} 頁`;
  }
  t = t.replace(/\s*\(page\s+\d+(?:-\d+)?\)/gi, "").trim();

  if (t.includes("·")) {
    const parts = t.split("·").map((p) => p.trim()).filter(Boolean);
    t = parts[parts.length - 1] ?? t;
  }

  t = t.replace(GS_PREFIX, "");
  const pdf = t.match(/([^/\\]+\.pdf)/i)?.[1];
  if (pdf) t = pdf.replace(/\.pdf$/i, "");
  else t = t.replace(/\.pdf$/i, "");

  return {
    title: t.slice(0, 160) || "參考資料",
    page: page || "—",
  };
}

function pageLabelFromHit(hit: RagChunkHit): string {
  if (hit.pageLabel?.trim()) return hit.pageLabel.trim();
  return parseCitationSourceParts(hit.title).page;
}

function titleFromHit(hit: RagChunkHit): string {
  if (hit.sourceFileName?.trim()) {
    return hit.sourceFileName.replace(GS_PREFIX, "").replace(/\.pdf$/i, "");
  }
  return parseCitationSourceParts(pdfNameFromHit(hit)).title;
}

export function buildCitationCardsFromHits(hits: RagChunkHit[]): CitationCard[] {
  return hits.map((hit, index) => ({
    id: index + 1,
    title: titleFromHit(hit),
    page: pageLabelFromHit(hit),
    excerpt: stripRagBoilerplate(hit.snippet),
  }));
}

export function scriptCitationsToCards(citations: ScriptCitation[]): CitationCard[] {
  return citations.map((c, index) => {
    const parsed = parseCitationSourceParts(c.question, c.page);
    return {
      id: c.index || index + 1,
      title: parsed.title,
      page: parsed.page,
      excerpt: c.script?.trim() ?? "",
    };
  });
}

export function buildKnowledgeXmlContext(cards: CitationCard[], charLimitPerDoc = 2400): string {
  return cards
    .filter((card) => (card.excerpt ?? "").trim().length >= 4)
    .map(
      (card) => `<Doc id="${card.id}">
[檔案名稱]: ${card.title}
[引用位置]: ${card.page}
[原始內容]: ${card.excerpt.slice(0, charLimitPerDoc)}
</Doc>`,
    )
    .join("\n");
}

/** 最強引用死線（置於 prompt 首尾，對齊前端可點擊的 citation 編號） */
export function buildCitationMarkerHardLimit(maxDocId: number): string {
  const max = Math.max(1, Math.min(maxDocId, 8));
  return `【數字標籤死線 — 違反即為錯誤回答】
目前 Doc id 只有 1 到 ${max}，嚴禁生成任何大於 ${max} 的編號（例如嚴禁 [6]、[8]、[10]、[11]）！
沒有對應 Doc 的句子絕對不要打上任何 [id] 標籤！
你只能使用 1～${max}；多餘的競品或規格若無摘錄支撐，寧可不標記。`;
}

/** 依本次注入的 Doc 數量產生引用標籤死線（避免模型通靈 [10] 等） */
export function buildCitationMarkerRules(maxDocId: number): string {
  const max = Math.max(1, Math.min(maxDocId, 8));
  const range = max === 1 ? "1" : `1 到 ${max}`;
  return `${buildCitationMarkerHardLimit(max)}

【引用制約規則】
- 引用 <Doc> 中的數據、規格或話術時，在該句結尾緊跟 [id]（id 為 Doc 的數字，如 [1]、[2]）。
- 範例：X-TRAIL 最大馬力為 204ps[1]，平均油耗 16.0 km/L[2]。

【數字標籤嚴格限制（死線）】
- 你只能使用目前實際提供給你的 Doc id 數字（本次僅 ${range}，共 ${max} 則）。
- 絕對禁止生成任何大於 ${max} 的數字標籤（嚴禁 [${max + 1}]、[${max + 2}]、[8]、[10]、[11] 等超出範圍標記）。
- 若某句完全來自你腦中的外部車款知識、且知識庫沒有對應 Doc，該句結尾「不要」加任何 [id]。
- 禁止捏造不存在的 id；未引用片段時不要加標記。
- 規則核心：標籤範圍嚴格限制在 1～${max}！`;
}

/** 預設（最多 5 則 Doc） */
export const CITATION_MARKER_RULES = buildCitationMarkerRules(5);
