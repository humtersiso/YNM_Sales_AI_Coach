import { listActiveProductLines } from "@/lib/ingest/contracts/training-product-registry";
import {
  getRagCorpusForCategory,
  listConfiguredRagCorpora,
} from "@/lib/rag/rag-engine-config";

export type RoleplayRagCorpusStatus = {
  category: string;
  label: string;
  ready: boolean;
  resourceHint: string;
};

export type RoleplayRagSupportedProduct = {
  id: string;
  displayName: string;
  ragReady: boolean;
  corpora: RoleplayRagCorpusStatus[];
};

const CORPUS_LABELS: Record<string, string> = {
  product_info: "本品資訊語料",
  competitor_compare: "競品比較語料",
  sales_script: "銷售話術語料",
};

function corpusHint(resource: string): string {
  if (!resource) return "未設定";
  const m = resource.match(/ragCorpora\/(\d+)/);
  if (m) return `Vertex RAG · …${m[1].slice(-6)}`;
  const ds = resource.match(/dataStores\/([^/]+)/);
  if (ds) return `Discovery · ${ds[1]}`;
  return "已設定";
}

function buildCorporaSummary(): RoleplayRagCorpusStatus[] {
  const categories = ["product_info", "competitor_compare", "sales_script"] as const;
  return categories.map((cat) => {
    const cfg = getRagCorpusForCategory(cat);
    const ready = Boolean(cfg?.ragCorpusResource?.includes("/ragCorpora/"));
    return {
      category: cat,
      label: CORPUS_LABELS[cat] ?? cat,
      ready,
      resourceHint: corpusHint(cfg?.ragCorpusResource ?? ""),
    };
  });
}

/** 對練可用車型：active 產品線 + 本品 RAG 語料庫已就緒 */
export function getRoleplayRagSupportedProducts(): {
  ragConfigured: boolean;
  productCorpusReady: boolean;
  products: RoleplayRagSupportedProduct[];
  corporaOverview: RoleplayRagCorpusStatus[];
} {
  const corporaOverview = buildCorporaSummary();
  const productCorpusReady = corporaOverview.find((c) => c.category === "product_info")?.ready ?? false;
  const ragConfigured = listConfiguredRagCorpora().length > 0;

  const products: RoleplayRagSupportedProduct[] = listActiveProductLines()
    .filter(() => productCorpusReady)
    .map((p) => ({
      id: p.id,
      displayName: p.displayName,
      ragReady: productCorpusReady,
      corpora: corporaOverview,
    }));

  return {
    ragConfigured,
    productCorpusReady,
    products,
    corporaOverview,
  };
}

export function isRoleplayProductRagReady(productLineId: string): boolean {
  const { productCorpusReady, products } = getRoleplayRagSupportedProducts();
  if (!productCorpusReady) return false;
  return products.some((p) => p.id === productLineId.trim());
}
