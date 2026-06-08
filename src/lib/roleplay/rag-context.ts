import { getProductLine } from "@/lib/ingest/contracts/training-product-registry";
import type { RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";
import {
  isCoachOnlySnippet,
  sanitizeCoachFactLabel,
  sanitizeCoachFactValue,
} from "@/lib/roleplay/customer-text-sanitize";
import type { RagChunkHit } from "@/lib/rag/discovery-engine-search";
import { getRagCorpusForCategory } from "@/lib/rag/rag-engine-config";
import { searchVertexRagCorpus } from "@/lib/rag/vertex-rag-search";

export const MIN_RAG_FACTS = 2;
const MIN_FACT_VALUE_LEN = 20;

export type RoleplayRagBundle = {
  hits: RagChunkHit[];
  facts: { label: string; value: string }[];
  keyPoints: string[];
  forbidden: string[];
  closingActions: string[];
  strategyIds: string[];
  coverageOk: boolean;
  validFactCount: number;
};

export type RoleplayRagCoverage = {
  factCount: number;
  hitCount: number;
  strategyIds: string[];
  sourceTitles: string[];
  coverageOk: boolean;
};

export function isValidRagFact(fact: { label: string; value: string }): boolean {
  return fact.value !== "—" && fact.value.trim().length >= MIN_FACT_VALUE_LEN;
}

export function countValidFacts(facts: { label: string; value: string }[]): number {
  return facts.filter(isValidRagFact).length;
}

export function buildRagCoverageSummary(bundle: RoleplayRagBundle): RoleplayRagCoverage {
  const sourceTitles = [
    ...new Set(bundle.hits.map((h) => h.title?.trim()).filter(Boolean) as string[]),
  ].slice(0, 8);
  return {
    factCount: bundle.validFactCount,
    hitCount: bundle.hits.length,
    strategyIds: bundle.strategyIds,
    sourceTitles,
    coverageOk: bundle.coverageOk,
  };
}

export class RoleplayRagCoverageError extends Error {
  constructor(message = "此車型與競品組合暫無足夠教材，請先在銷售助手查詢相關知識") {
    super(message);
    this.name = "RoleplayRagCoverageError";
  }
}

export function assertRagCoverageOk(bundle: RoleplayRagBundle): void {
  if (!bundle.coverageOk) {
    throw new RoleplayRagCoverageError();
  }
}

function personaQueryHint(personaId: string): string {
  const hints: Record<string, string> = {
    "P-01": "規格 數據 試算 測試條件",
    "P-02": "品牌 駕駛感受 信任 服務",
    "P-03": "價格 優惠 總持有成本 促銷",
    "P-04": "試乘 下一步 家人商量",
    "P-05": "論壇 規格 數字 來源 查核",
  };
  return hints[personaId] ?? "話術 競品 比較";
}

function buildSearchQuery(config: RoleplaySessionConfig): string {
  const product = getProductLine(config.productLine)?.displayName ?? "X-TRAIL";
  return `${product} vs ${config.competitor} 銷售話術 競品比較 產品特色 ${personaQueryHint(config.personaId)}`;
}

function dedupeHits(hits: RagChunkHit[]): RagChunkHit[] {
  const seen = new Set<string>();
  const out: RagChunkHit[] = [];
  for (const h of hits) {
    const key = `${h.title ?? ""}|${(h.snippet ?? "").slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

function snippetToFact(hit: RagChunkHit, index: number): { label: string; value: string } {
  const rawTitle = hit.title?.trim() || "";
  const rawText = hit.snippet?.trim() || "";
  const value = sanitizeCoachFactValue(rawText);
  return {
    label: sanitizeCoachFactLabel(rawTitle, index),
    value: value || "—",
  };
}

function extractStrategies(hits: RagChunkHit[]): {
  keyPoints: string[];
  forbidden: string[];
  closingActions: string[];
  strategyIds: string[];
} {
  const keyPoints: string[] = [];
  const forbidden = ["直接攻擊競品品質", "保證一定比競品省油", "未經查證的數據"];
  const closingActions = ["邀請試乘", "提供油耗試算", "約第二次到店"];
  const strategyIds: string[] = [];

  for (const h of hits.slice(0, 8)) {
    const id = h.title?.match(/KB-[A-Z0-9-]+/i)?.[0];
    if (id && !strategyIds.includes(id)) strategyIds.push(id);
    const line = sanitizeCoachFactValue(h.snippet?.trim().split(/\n/)[0] ?? "");
    if (line && line !== "—" && !isCoachOnlySnippet(line) && keyPoints.length < 6) {
      keyPoints.push(line.slice(0, 120));
    }
  }

  return { keyPoints, forbidden, closingActions, strategyIds };
}

export async function fetchRoleplayRagContext(
  config: RoleplaySessionConfig,
): Promise<RoleplayRagBundle> {
  const query = buildSearchQuery(config);
  const topK = Number(process.env.ROLEPLAY_RAG_TOP_K ?? "8") || 8;
  const allHits: RagChunkHit[] = [];

  const categories = ["product_info", "competitor_compare", "sales_script"] as const;

  for (const cat of categories) {
    const cfg = getRagCorpusForCategory(cat);
    if (!cfg?.ragCorpusResource.includes("/ragCorpora/")) continue;
    try {
      const hits = await searchVertexRagCorpus(
        cfg.ragCorpusResource,
        query,
        cfg.materialCategory,
        topK,
      );
      allHits.push(...hits);
    } catch (e) {
      console.warn("[roleplay] RAG search failed", cat, e);
    }
  }

  const sorted = dedupeHits([...allHits]).sort(
    (a, b) => (b.relevance ?? 0) - (a.relevance ?? 0),
  );
  const top = sorted.slice(0, topK);
  const facts = top
    .map((h, i) => snippetToFact(h, i))
    .filter((f) => isValidRagFact(f))
    .slice(0, 10);
  const strategies = extractStrategies(top);
  const validFactCount = facts.length;
  const coverageOk = validFactCount >= MIN_RAG_FACTS;

  return {
    hits: top,
    facts,
    ...strategies,
    coverageOk,
    validFactCount,
  };
}
