import { getBigQueryClient } from "@/lib/bq/script-drills-insert";
import {
  getBigQueryDataset,
  getBigQueryProjectId,
  getSalesKnowledgeTableId,
} from "@/lib/bq/knowledge-config";
import {
  getPreferredMaterialCategory,
  type KnowledgeSearchScope,
} from "@/lib/knowledge/search-scope";
import { isGarbledText } from "@/lib/ingest/text-normalize";
import {
  augmentCostQueryForSearch,
  expandCostSearchTerms,
  isCostDetailQuery,
} from "@/lib/gemini/cost-query-expand";
import {
  augmentSpecQueryForSearch,
  expandSpecSearchTerms,
  isSpecNumericQuery,
} from "@/lib/gemini/spec-query-expand";
import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { dedupeCitations } from "@/lib/gemini/citation-utils";
import { enrichCitation } from "@/lib/gemini/citation-labels";
import { isValidCitation } from "@/lib/gemini/reply-format";
import { sqlRecallLimit } from "@/lib/gemini/sales-chat-speed";

export type KnowledgeRow = {
  customer_question: string;
  /** 引用顯示用（PDF/PPT 檔名+頁碼）；檢索以 customer_question + standard_script 為主 */
  title?: string | null;
  standard_script: string;
  material_category?: string;
  product_line?: string;
  source_locator?: string;
  relevance?: number;
};

export type ScoredKnowledgeHit = KnowledgeRow & {
  bqRelevance: number;
};

/** 從問句抽出檔名線索（含底線、中文+影片等） */
export function extractFileHints(message: string): string[] {
  const hints: string[] = [];
  for (const m of message.match(/[\p{L}\p{N}]+(?:_[\p{L}\p{N}_]+)+/gu) ?? []) {
    hints.push(m);
  }
  for (const m of message.match(/[\u4e00-\u9fff]{2,}(?:影片|手冊|簡報|話術|比較表)/gu) ?? []) {
    hints.push(m);
  }
  const compact = message.replace(/\s+/g, "");
  for (const m of compact.match(/[\p{L}\p{N}_]{6,}\.pdf/giu) ?? []) {
    hints.push(m.replace(/\.pdf$/i, ""));
  }
  return [...new Set(hints.map((h) => h.trim()).filter((h) => h.length >= 3))];
}

/** 一般關鍵字（排除過短、純標點問句） */
export function expandSearchKeywords(terms: string[]): string[] {
  const out = new Set<string>();
  for (const raw of terms) {
    const t = raw.trim();
    if (t.length < 2) continue;
    out.add(t);
    const stem = t.replace(/(如何|怎麼样|怎么样|怎样|嗎|吗|呢|\?|？)$/u, "").trim();
    if (stem.length >= 2 && stem !== t) out.add(stem);
    if (/^[\u4e00-\u9fff]{6,}$/.test(t)) {
      for (let len = 2; len <= 3; len++) {
        for (let i = 0; i <= t.length - len; i++) {
          out.add(t.slice(i, i + len));
        }
      }
    }
  }
  return [...out].filter((t) => t.length >= 2).slice(0, 12);
}

export function extractSearchKeywords(message: string): string[] {
  const terms: string[] = [];
  for (const m of message.match(/[\p{L}\p{N}]+(?:_[\p{L}\p{N}_]+)+/gu) ?? []) {
    if (m.length >= 3) terms.push(m);
  }
  for (const m of message.match(/[\u4e00-\u9fff]{2,}/gu) ?? []) {
    terms.push(m);
  }
  for (const m of message.match(/[A-Za-z]{3,}/g) ?? []) {
    terms.push(m);
  }
  return expandSearchKeywords([...new Set(terms)]);
}

function resolveLimit(scope: KnowledgeSearchScope, message: string): number {
  const hints = extractFileHints(message);
  if (hints.length > 0) return 12;
  const pref = getPreferredMaterialCategory(scope);
  if (pref === "competitor_compare") return 8;
  if (pref === "sales_script") return 5;
  return 6;
}

function buildScopeSql(scope: KnowledgeSearchScope): {
  productFilter: string;
  categoryBoost: string;
  productBoost: string;
  params: Record<string, string>;
} {
  const params: Record<string, string> = {};
  let productFilter = "";
  let categoryBoost = "0";
  let productBoost = "0";

  if (scope.productLine?.trim()) {
    productFilter = `AND (product_line = @productLine OR product_line = '_common')`;
    params.productLine = scope.productLine.trim();
    productBoost = `CASE WHEN product_line = @productLine THEN 5 ELSE 0 END`;
  }

  const preferred = getPreferredMaterialCategory(scope);
  if (preferred?.trim()) {
    params.preferredCategory = preferred.trim();
    categoryBoost = `CASE WHEN material_category = @preferredCategory THEN 10 ELSE 0 END`;
  }

  return { productFilter, categoryBoost, productBoost, params };
}

async function queryRows(
  sql: string,
  params: Record<string, string>,
): Promise<KnowledgeRow[]> {
  const projectId = getBigQueryProjectId();
  const dataset = getBigQueryDataset();
  const tableId = getSalesKnowledgeTableId();
  if (!projectId) return [];

  const client = getBigQueryClient();
  const [rows] = await client.query({
    query: sql.replace(/\{table\}/g, `\`${projectId}.${dataset}.${tableId}\``),
    params,
  });
  return rows as KnowledgeRow[];
}

function rowKey(row: KnowledgeRow): string {
  const q = row.customer_question?.trim().toLowerCase() ?? "";
  const loc = row.source_locator?.trim() ?? "";
  return `${q}::${loc}`;
}

export function citationDisplayTitle(hit: KnowledgeRow): string {
  const title = hit.title?.trim();
  const cq = hit.customer_question?.trim() ?? "";
  if (title && cq && /^工作表\s*\d+$/i.test(title) && cq.length > title.length + 8) {
    return cq.slice(0, 200);
  }
  if (title) return title;
  if (/\.(pdf|pptx|ppt)\s*\((?:page|slide)\s*\d+\)/i.test(cq) && !cq.includes(" · ")) {
    return cq;
  }
  return cq;
}

export function hitsToCitations(hits: ScoredKnowledgeHit[]): ScriptCitation[] {
  const raw = hits
    .map((r) =>
      enrichCitation(
        {
          index: 0,
          question: citationDisplayTitle(r),
          script: r.standard_script?.trim() || "",
          materialCategory: r.material_category,
        },
        r.material_category,
      ),
    )
    .filter((c) => isValidCitation(c) && !isGarbledText(c.script));
  return dedupeCitations(raw);
}

function rowsToHits(rows: KnowledgeRow[]): ScoredKnowledgeHit[] {
  return rows.map((r) => ({
    ...r,
    bqRelevance: Number(r.relevance ?? 0),
  }));
}

/** 合併多通道檢索結果（以 customer_question + source_locator 去重，保留較高分） */
export function mergeKnowledgeHits(lists: ScoredKnowledgeHit[][]): ScoredKnowledgeHit[] {
  const byKey = new Map<string, ScoredKnowledgeHit>();
  for (const list of lists) {
    for (const hit of list) {
      const key = rowKey(hit);
      const prev = byKey.get(key);
      if (!prev || hit.bqRelevance > prev.bqRelevance) {
        byKey.set(key, hit);
      }
    }
  }
  return [...byKey.values()];
}

function sqlLimitClause(limit: number): string {
  return limit > 0 ? `LIMIT ${limit}` : "";
}

async function searchByFileHintsInternal(
  hints: string[],
  scope: KnowledgeSearchScope,
  limit: number,
  hintMode: "and" | "or",
): Promise<ScoredKnowledgeHit[]> {
  if (hints.length === 0) return [];

  const { productFilter, categoryBoost, productBoost, params } = buildScopeSql(scope);
  const joiner = hintMode === "and" ? " AND " : " OR ";
  const hintConds = hints.map(
    (_, i) =>
      `(LOWER(customer_question) LIKE LOWER(@hint${i})
        OR LOWER(COALESCE(title, '')) LIKE LOWER(@hint${i})
        OR LOWER(standard_script_idea) LIKE LOWER(@hint${i}))`,
  );
  hints.forEach((h, i) => {
    params[`hint${i}`] = `%${h}%`;
  });

  const sql = `
    SELECT customer_question, title, standard_script_idea AS standard_script, material_category, product_line, source_locator,
      (${categoryBoost} + ${productBoost}) AS relevance
    FROM {table}
    WHERE (${hintConds.join(joiner)})
      AND standard_script_idea IS NOT NULL
      AND TRIM(standard_script_idea) != ''
      ${productFilter}
    ORDER BY relevance DESC, customer_question
    ${sqlLimitClause(limit)}
  `;

  return rowsToHits(await queryRows(sql, params));
}

/** 檔名線索：先 AND，0 筆改 OR */
export async function searchByFileHints(
  hints: string[],
  scope: KnowledgeSearchScope,
  limit: number,
): Promise<ScoredKnowledgeHit[]> {
  if (hints.length <= 1) {
    return searchByFileHintsInternal(hints, scope, limit, "or");
  }
  const byAnd = await searchByFileHintsInternal(hints, scope, limit, "and");
  if (byAnd.length > 0) return byAnd;
  return searchByFileHintsInternal(hints, scope, limit, "or");
}

/** 關鍵字 OR 搜尋 */
export async function searchByKeywords(
  keywords: string[],
  scope: KnowledgeSearchScope,
  limit: number,
): Promise<ScoredKnowledgeHit[]> {
  if (keywords.length === 0) return [];

  const { productFilter, categoryBoost, productBoost, params } = buildScopeSql(scope);
  const questionLikes = keywords.map((_, i) => `LOWER(customer_question) LIKE LOWER(@kw${i})`);
  const titleLikes = keywords.map((_, i) => `LOWER(COALESCE(title, '')) LIKE LOWER(@kw${i})`);
  const scriptLikes = keywords.map((_, i) => `LOWER(standard_script_idea) LIKE LOWER(@kw${i})`);
  keywords.forEach((kw, i) => {
    params[`kw${i}`] = `%${kw}%`;
  });

  const scoreParts = keywords.flatMap((_, i) => [
    `CASE WHEN LOWER(standard_script_idea) LIKE LOWER(@kw${i}) THEN 4 ELSE 0 END`,
    `CASE WHEN LOWER(customer_question) LIKE LOWER(@kw${i}) THEN 2 ELSE 0 END`,
    `CASE WHEN LOWER(COALESCE(title, '')) LIKE LOWER(@kw${i}) THEN 1 ELSE 0 END`,
  ]);

  const sql = `
    SELECT customer_question, title, standard_script_idea AS standard_script, material_category, product_line, source_locator,
      (${scoreParts.join(" + ")} + ${categoryBoost} + ${productBoost}) AS relevance
    FROM {table}
    WHERE (${[...questionLikes, ...titleLikes, ...scriptLikes].join(" OR ")})
      AND standard_script_idea IS NOT NULL
      AND TRIM(standard_script_idea) != ''
      ${productFilter}
    ORDER BY relevance DESC, customer_question
    ${sqlLimitClause(limit)}
  `;

  return rowsToHits(await queryRows(sql, params));
}

/**
 * 原始 BQ 檢索（高召回）；回傳含 relevance 的 hit 列表供 rerank。
 */
export async function searchKnowledgeRawHits(
  message: string,
  scope: KnowledgeSearchScope = {},
  poolLimit?: number | null,
): Promise<ScoredKnowledgeHit[]> {
  const searchMessage = augmentCostQueryForSearch(augmentSpecQueryForSearch(message));
  const recallLimit =
    poolLimit === null
      ? sqlRecallLimit(null)
      : poolLimit != null && poolLimit > 0
        ? poolLimit
        : Math.max(resolveLimit(scope, searchMessage) * 3, 20);
  const hints = extractFileHints(searchMessage);

  if (hints.length > 0) {
    const byHint = await searchByFileHints(hints, scope, recallLimit);
    if (byHint.length > 0) return byHint;
  }

  let keywords = extractSearchKeywords(searchMessage);
  if (isSpecNumericQuery(searchMessage)) {
    keywords = expandSpecSearchTerms(searchMessage, keywords);
  }
  if (isCostDetailQuery(searchMessage)) {
    keywords = expandCostSearchTerms(searchMessage, keywords);
  }
  return searchByKeywords(keywords, scope, recallLimit);
}

/**
 * 知識庫檢索：檔名線索優先，其次關鍵字評分；不回傳 Gemini / 表格框架。
 */
export async function searchKnowledgeCitations(
  message: string,
  scope: KnowledgeSearchScope = {},
  limitOverride?: number,
): Promise<ScriptCitation[]> {
  const limit = limitOverride ?? resolveLimit(scope, message);
  const hits = await searchKnowledgeRawHits(message, scope, Math.max(limit * 3, 20));
  return hitsToCitations(hits.slice(0, limit));
}
