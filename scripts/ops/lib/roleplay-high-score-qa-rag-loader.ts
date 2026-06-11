/**
 * 高分問答集 · RAG 資料載入（Vertex 即時檢索 或 playbook snapshot）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRoleplayRagContext } from "../../../src/lib/roleplay/rag-context";
import type { RoleplaySessionConfig } from "../../../src/lib/roleplay/scenario-contract";
import { normalizeCompetitorToken } from "../../../src/lib/roleplay/engine/correction-guide";
import { buildRagSnippetPool } from "./roleplay-high-score-qa-rag-text";
import type { RagChapterInput } from "./roleplay-high-score-qa-core";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SNAPSHOT_PATH = path.join(webRoot, "data/roleplay-rag-playbook-snapshot.json");

export type RagLoadMode = "snapshot" | "live";

type SnapshotFile = {
  exportedAt?: string;
  items: {
    competitor: string;
    productLine?: string;
    ok?: boolean;
    opening?: string;
    facts: { label: string; value: string }[];
    sources?: string[];
  }[];
};

const CHAPTER_SPECS: {
  slug: string;
  competitor: string;
  product: string;
  productLine: "xtrail-ice" | "kicks";
}[] = [
  { slug: "rav4", competitor: "Toyota RAV4", product: "X-TRAIL ICE", productLine: "xtrail-ice" },
  { slug: "crv", competitor: "Honda CR-V", product: "X-TRAIL ICE", productLine: "xtrail-ice" },
  {
    slug: "tucson",
    competitor: "Hyundai Tucson L",
    product: "X-TRAIL ICE",
    productLine: "xtrail-ice",
  },
  {
    slug: "outlander",
    competitor: "Mitsubishi Outlander",
    product: "X-TRAIL ICE",
    productLine: "xtrail-ice",
  },
  { slug: "sportage", competitor: "KIA Sportage", product: "X-TRAIL ICE", productLine: "xtrail-ice" },
  {
    slug: "kicks-hrv",
    competitor: "Honda HR-V",
    product: "KICKS",
    productLine: "kicks",
  },
];

function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(webRoot, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
    }
    break;
  }
}

function defaultConfig(spec: (typeof CHAPTER_SPECS)[0]): RoleplaySessionConfig {
  return {
    productLine: spec.productLine,
    personaId: "P-01",
    ageRange: "30-40",
    competitor: spec.competitor,
    maxTurns: 5,
    difficulty: "advanced",
  };
}

function bundleToChapterInput(
  spec: (typeof CHAPTER_SPECS)[0],
  bundle: {
    facts: { label: string; value: string }[];
    keyPoints: string[];
    closingActions: string[];
    coverageOk: boolean;
    hits: { title?: string }[];
  },
  opening?: string,
  sources?: string[],
): RagChapterInput {
  const short = normalizeCompetitorToken(spec.competitor);
  const snippets = buildRagSnippetPool(bundle.facts, spec.competitor, bundle.keyPoints);
  if (snippets.length < 2) {
    throw new Error(
      `${spec.competitor}：RAG 可引用句不足（${snippets.length}），請執行 npm run dump:roleplay-rag 或 --live 重抓`,
    );
  }
  const sourceTitles =
    sources ??
    [...new Set(bundle.hits.map((h) => h.title?.trim()).filter(Boolean) as string[])].slice(0, 6);

  return {
    slug: spec.slug,
    competitor: spec.competitor,
    short,
    product: spec.product,
    productLine: spec.productLine === "kicks" ? "kicks" : "xtrail",
    facts: bundle.facts,
    snippets,
    keyPoints: bundle.keyPoints,
    closingActions: bundle.closingActions,
    sources: sourceTitles,
    opening,
    ragExportedAt: undefined,
  };
}

async function loadLiveChapter(spec: (typeof CHAPTER_SPECS)[0]): Promise<RagChapterInput> {
  const bundle = await fetchRoleplayRagContext(defaultConfig(spec));
  if (!bundle.coverageOk) {
    throw new Error(`${spec.competitor}：Vertex RAG 覆蓋不足（facts < 2）`);
  }
  return bundleToChapterInput(spec, bundle);
}

function loadSnapshotChapter(spec: (typeof CHAPTER_SPECS)[0], snap: SnapshotFile): RagChapterInput {
  const item = snap.items.find((i) => {
    if (spec.productLine === "kicks") {
      return i.productLine === "kicks" || /KICKS\s*vs\s*HR-V/i.test(i.competitor);
    }
    return i.competitor === spec.competitor && i.productLine !== "kicks";
  });
  if (!item?.facts?.length) {
    throw new Error(
      `${spec.competitor}：snapshot 無資料，請執行 npm run dump:roleplay-rag（含 KICKS）`,
    );
  }
  const bundle = {
    facts: item.facts,
    keyPoints: [] as string[],
    closingActions: ["邀請試乘", "提供油耗試算", "約第二次到店"],
    coverageOk: item.ok !== false && item.facts.length >= 2,
    hits: (item.sources ?? []).map((title) => ({ title })),
  };
  if (!bundle.coverageOk) {
    throw new Error(`${spec.competitor}：snapshot 標記覆蓋不足`);
  }
  return {
    ...bundleToChapterInput(spec, bundle, item.opening, item.sources),
    ragExportedAt: snap.exportedAt,
  };
}

async function loadChapterWithFallback(
  spec: (typeof CHAPTER_SPECS)[0],
  snap: SnapshotFile | null,
  mode: RagLoadMode,
): Promise<RagChapterInput> {
  if (mode === "live") {
    return loadLiveChapter(spec);
  }
  try {
    if (!snap) throw new Error("no snapshot");
    return loadSnapshotChapter(spec, snap);
  } catch (snapErr) {
    console.warn(
      `[score-guide] ${spec.competitor} snapshot 不足，改即時 Vertex RAG…`,
      snapErr instanceof Error ? snapErr.message : snapErr,
    );
    loadEnvFiles();
    return loadLiveChapter(spec);
  }
}

export async function loadAllRagChapterInputs(mode: RagLoadMode): Promise<RagChapterInput[]> {
  if (mode === "live") {
    loadEnvFiles();
    const out: RagChapterInput[] = [];
    for (const spec of CHAPTER_SPECS) {
      out.push(await loadLiveChapter(spec));
    }
    return out;
  }

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(
      `找不到 ${SNAPSHOT_PATH}，請先執行 npm run dump:roleplay-rag 或使用 --live`,
    );
  }
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8")) as SnapshotFile;
  const out: RagChapterInput[] = [];
  for (const spec of CHAPTER_SPECS) {
    out.push(await loadChapterWithFallback(spec, snap, mode));
  }
  return out;
}

export { SNAPSHOT_PATH, CHAPTER_SPECS };
