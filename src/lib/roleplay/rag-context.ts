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

export type RoleplayRagBundle = {
  hits: RagChunkHit[];
  facts: { label: string; value: string }[];
  keyPoints: string[];
  forbidden: string[];
  closingActions: string[];
  strategyIds: string[];
};

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

  for (const h of hits.slice(0, 5)) {
    const id = h.title?.match(/KB-[A-Z0-9-]+/i)?.[0];
    if (id) strategyIds.push(id);
    const line = sanitizeCoachFactValue(h.snippet?.trim().split(/\n/)[0] ?? "");
    if (line && line !== "—" && !isCoachOnlySnippet(line) && keyPoints.length < 6) {
      keyPoints.push(line.slice(0, 120));
    }
  }

  if (keyPoints.length === 0) {
    keyPoints.push(
      "先同理客戶比較競品的動機",
      "用 RAG 事實回應，說明測試條件或規格基準",
      "轉向本品差異化優勢",
      "邀請試乘或安排下一步",
    );
  }

  return { keyPoints, forbidden, closingActions, strategyIds };
}

export async function fetchRoleplayRagContext(
  config: RoleplaySessionConfig,
): Promise<RoleplayRagBundle> {
  const query = buildSearchQuery(config);
  const topK = Number(process.env.ROLEPLAY_RAG_TOP_K ?? "4") || 4;
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

  const sorted = [...allHits].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
  const top = sorted.slice(0, topK);
  const facts = top.slice(0, 6).map((h, i) => snippetToFact(h, i));
  const strategies = extractStrategies(top);

  if (facts.length === 0) {
    facts.push(
      { label: "查核提醒", value: "請依官方 WLTC 基準說明油耗，並說明試算方式（年里程×油價÷油耗）。" },
      { label: "回應原則", value: "避免斷章取義比較競品數字，需說明測試條件一致。" },
    );
  }

  return { hits: top, facts, ...strategies };
}
