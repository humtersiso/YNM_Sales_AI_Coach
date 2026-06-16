import { getProductLine } from "@/lib/ingest/contracts/training-product-registry";
import {
  ROLEPLAY_COMPETITORS_XTRAIL,
} from "@/lib/roleplay/catalog";
import {
  countCompetitorBattleHits,
  MIN_COMPETITOR_RAG_HITS,
} from "@/lib/roleplay/roleplay-rag-filter";
import { isRoleplayProductRagReady } from "@/lib/roleplay/roleplay-rag-products";
import type { RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";
import {
  MIN_RAG_FACTS,
  type RoleplayRagBundle,
} from "@/lib/roleplay/rag-context";
import { getRagCorpusForCategory } from "@/lib/rag/rag-engine-config";
import { searchVertexRagCorpus } from "@/lib/rag/vertex-rag-search";

const CACHE_TTL_MS = 15 * 60 * 1000;
/** 邏輯變更時遞增，避免舊快取仍含誤判競品 */
const CACHE_VERSION = 4;

type CompetitorCacheEntry = { at: number; version: number; competitors: string[] };
const competitorCache = new Map<string, CompetitorCacheEntry>();
const probeInFlight = new Map<string, Promise<string[]>>();

/** 下拉選單：僅需 competitor_compare 檔名／標題含本場競品 */
export function hasCompetitorBattleCorpus(
  hits: RoleplayRagBundle["hits"],
  competitor: string,
): boolean {
  return countCompetitorBattleHits(hits, competitor) >= MIN_COMPETITOR_RAG_HITS;
}

/** 開局：須有足夠事實＋對戰教材 */
export function isCompetitorRagReady(
  bundle: RoleplayRagBundle,
  competitor: string,
): boolean {
  if (bundle.validFactCount < MIN_RAG_FACTS) return false;
  return hasCompetitorBattleCorpus(bundle.hits, competitor);
}

function probeConfig(
  productLine: string,
  competitor: string,
): RoleplaySessionConfig {
  return {
    productLine,
    competitor,
    personaId: "P-01",
    ageRange: "30-40",
    maxTurns: 5,
    difficulty: "advanced",
  };
}

function buildBattleProbeQuery(productLine: string, competitor: string): string {
  const product = getProductLine(productLine)?.displayName ?? "X-TRAIL";
  return `${product} vs ${competitor} 對戰話術 競品比較`;
}

/** 輕量探測：只查 competitor_compare 語料庫（1 次 API／競品） */
async function probeCompetitorBattleCorpus(
  productLine: string,
  competitor: string,
): Promise<boolean> {
  const cfg = getRagCorpusForCategory("competitor_compare");
  if (!cfg?.ragCorpusResource.includes("/ragCorpora/")) return false;
  const hits = await searchVertexRagCorpus(
    cfg.ragCorpusResource,
    buildBattleProbeQuery(productLine, competitor),
    "competitor_compare",
    6,
  );
  return hasCompetitorBattleCorpus(hits, competitor);
}

async function probeRagReadyCompetitors(
  productLine: string,
  candidates: readonly string[],
): Promise<string[]> {
  const ready: string[] = [];
  await Promise.all(
    candidates.map(async (competitor) => {
      try {
        if (await probeCompetitorBattleCorpus(productLine, competitor)) {
          ready.push(competitor);
        }
      } catch {
        /* 略過探測失敗的競品 */
      }
    }),
  );

  ready.sort((a, b) => candidates.indexOf(a) - candidates.indexOf(b));
  return ready;
}

/** 實際探測 RAG，回傳可開練的競品清單（依產品線快取；併發請求合併） */
export async function listRagReadyCompetitors(
  productLine: string,
  candidates: readonly string[] = ROLEPLAY_COMPETITORS_XTRAIL,
): Promise<string[]> {
  if (!isRoleplayProductRagReady(productLine)) return [];

  const cached = competitorCache.get(productLine);
  if (
    cached &&
    cached.version === CACHE_VERSION &&
    Date.now() - cached.at < CACHE_TTL_MS
  ) {
    return cached.competitors;
  }

  let inflight = probeInFlight.get(productLine);
  if (!inflight) {
    inflight = probeRagReadyCompetitors(productLine, candidates).then((ready) => {
      competitorCache.set(productLine, {
        at: Date.now(),
        version: CACHE_VERSION,
        competitors: ready,
      });
      return ready;
    }).finally(() => {
      probeInFlight.delete(productLine);
    });
    probeInFlight.set(productLine, inflight);
  }

  return inflight;
}

export function invalidateRagReadyCompetitorCache(productLine?: string): void {
  if (productLine) competitorCache.delete(productLine);
  else competitorCache.clear();
}
