import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { DiscoveredFile } from "@/lib/ingest/adapters/base-source-adapter";
import { unstructuredAdapter } from "@/lib/ingest/adapters/unstructured-adapter";
import { xlsxAdapter } from "@/lib/ingest/adapters/xlsx-adapter";
import type { KnowledgeUnitRow, SourceAssetRow } from "@/lib/ingest/contracts/knowledge-unit-contract";
import { DEFAULT_SOURCE_SYSTEM } from "@/lib/ingest/contracts/knowledge-unit-contract";
import { isRegisteredProductLine } from "@/lib/ingest/contracts/training-product-registry";
import { inferMaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import {
  extensionOf,
  inferProductLine,
  isParseableExtension,
  mimeTypeForExtension,
  shouldIgnoreRelativePath,
  tagsFromRelativePath,
  TRAINING_SOURCE_SYSTEM,
} from "@/lib/ingest/contracts/training-source-manifest";
import {
  findExistingContentHashes,
  insertKnowledgeUnitRows,
  insertSourceAssetRows,
} from "@/lib/bq/knowledge-insert";
import { isGarbledText, normalizeKnowledgeText } from "@/lib/ingest/text-normalize";

const ADAPTERS = [xlsxAdapter, unstructuredAdapter];

export type IngestBatchOptions = {
  /** 本次掃描的目錄（可為單一車款子目錄） */
  rootDir: string;
  /** 多車款根目錄（例：data/training-materials）；與 rootDir 搭配推斷 product_line */
  materialsRoot?: string;
  /** 車款 slug，例：xtrail-ice；未設則由路徑推斷 */
  productLine?: string;
  /** 僅處理指定副檔名（例：[".xlsx"]），用於修復後局部重匯 */
  extensionsOnly?: string[];
  ingestBatchId?: string;
  skipDedupe?: boolean;
  dryRun?: boolean;
};

export type IngestBatchReport = {
  ingestBatchId: string;
  productLine: string;
  rootDir: string;
  discovered: number;
  assetsInserted: number;
  unitsInserted: number;
  pendingParse: number;
  unsupported: number;
  skippedDedupe: number;
  errors: string[];
};

function hashFile(absolutePath: string): string {
  const buf = readFileSync(absolutePath);
  return createHash("sha256").update(buf).digest("hex").slice(0, 32);
}

function discoverFiles(rootDir: string): DiscoveredFile[] {
  const out: DiscoveredFile[] = [];

  function walk(dir: string) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      const rel = path.relative(rootDir, full).replace(/\\/g, "/");
      if (shouldIgnoreRelativePath(rel)) continue;
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        const st = statSync(full);
        out.push({
          absolutePath: full,
          relativePath: rel,
          fileName: ent.name,
          extension: extensionOf(ent.name),
          size: st.size,
        });
      }
    }
  }

  walk(rootDir);
  return out;
}

function pickAdapter(ext: string) {
  return ADAPTERS.find((a) => a.canHandle(ext)) ?? null;
}

function dropGarbledUnits(units: KnowledgeUnitRow[]): KnowledgeUnitRow[] {
  return units
    .map((u) => {
      const customer_question = normalizeKnowledgeText(u.customer_question) || null;
      const standard_script = normalizeKnowledgeText(u.standard_script) || null;
      const title = normalizeKnowledgeText(u.title) || null;
      if (
        isGarbledText(customer_question) ||
        isGarbledText(standard_script) ||
        isGarbledText(title)
      ) {
        return null;
      }
      return { ...u, customer_question, standard_script, title };
    })
    .filter((u): u is KnowledgeUnitRow => u !== null);
}

function stampProductLine(
  units: KnowledgeUnitRow[],
  productLine: string,
  materialCategory: KnowledgeUnitRow["material_category"],
): KnowledgeUnitRow[] {
  return units.map((u) => ({
    ...u,
    product_line: productLine,
    material_category: u.material_category ?? materialCategory,
    content_hash: createHash("sha256")
      .update([productLine, u.material_category, u.content_hash].join("|"))
      .digest("hex")
      .slice(0, 32),
  }));
}

/** 解析訓練目錄為 knowledge units（不寫入 BQ；供 RAG 匯入） */
export async function collectKnowledgeUnitsForRag(
  options: Pick<IngestBatchOptions, "rootDir" | "materialsRoot" | "productLine" | "extensionsOnly">,
): Promise<KnowledgeUnitRow[]> {
  const materialsRoot = options.materialsRoot ?? options.rootDir;
  const ingestBatchId = randomUUID();
  const ingestedAt = new Date().toISOString();
  let files = discoverFiles(options.rootDir);
  if (options.extensionsOnly?.length) {
    const allowed = new Set(options.extensionsOnly.map((e) => e.toLowerCase()));
    files = files.filter((f) => allowed.has(f.extension.toLowerCase()));
  }

  const productLine = inferProductLine({
    materialsRoot,
    ingestRoot: options.rootDir,
    relativePath: files[0]?.relativePath ?? "",
    explicitProductLine: options.productLine,
  });

  const allUnits: KnowledgeUnitRow[] = [];

  for (const file of files) {
    const ext = file.extension;
    const lineForFile = inferProductLine({
      materialsRoot,
      ingestRoot: options.rootDir,
      relativePath: file.relativePath,
      explicitProductLine: options.productLine ?? productLine,
    });
    const tags = tagsFromRelativePath(file.relativePath, lineForFile);
    const materialCategory = inferMaterialCategory(file.relativePath, lineForFile);
    const adapter = isParseableExtension(ext) ? pickAdapter(ext) : null;
    if (!adapter) continue;

    const assetId = randomUUID();
    const contentHash = hashFile(file.absolutePath);
    const asset: SourceAssetRow = {
      asset_id: assetId,
      ingest_batch_id: ingestBatchId,
      source_system: TRAINING_SOURCE_SYSTEM || DEFAULT_SOURCE_SYSTEM,
      product_line: lineForFile,
      material_category: materialCategory,
      relative_path: file.relativePath,
      file_name: file.fileName,
      mime_type: mimeTypeForExtension(ext),
      file_size: file.size,
      content_hash: contentHash,
      gcs_uri: null,
      parse_status: "pending",
      parse_error: null,
      ingested_at: ingestedAt,
    };

    const result = await adapter.parse(file, {
      ingestBatchId,
      assetId,
      asset,
      tags,
      ingestedAt,
      productLine: lineForFile,
    });
    if (result.parseStatus !== "ok" && result.units.length === 0) continue;
    allUnits.push(
      ...stampProductLine(dropGarbledUnits(result.units), lineForFile, materialCategory),
    );
  }

  return allUnits;
}

export async function runIngestBatch(options: IngestBatchOptions): Promise<IngestBatchReport> {
  const materialsRoot = options.materialsRoot ?? options.rootDir;
  const ingestBatchId = options.ingestBatchId ?? randomUUID();
  const ingestedAt = new Date().toISOString();
  let files = discoverFiles(options.rootDir);
  if (options.extensionsOnly?.length) {
    const allowed = new Set(options.extensionsOnly.map((e) => e.toLowerCase()));
    files = files.filter((f) => allowed.has(f.extension.toLowerCase()));
  }
  const errors: string[] = [];
  let assetsInserted = 0;
  let unitsInserted = 0;
  let pendingParse = 0;
  let unsupported = 0;
  let skippedDedupe = 0;

  const productLine = inferProductLine({
    materialsRoot,
    ingestRoot: options.rootDir,
    relativePath: files[0]?.relativePath ?? "",
    explicitProductLine: options.productLine,
  });

  if (!isRegisteredProductLine(productLine)) {
    errors.push(
      `車款 "${productLine}" 未在 training-product-registry 登錄，仍會匯入；建議先登記後再跑正式環境。`,
    );
  }

  const assets: SourceAssetRow[] = [];
  const allUnits: KnowledgeUnitRow[] = [];

  for (const file of files) {
    const ext = file.extension;
    const lineForFile = inferProductLine({
      materialsRoot,
      ingestRoot: options.rootDir,
      relativePath: file.relativePath,
      explicitProductLine: options.productLine ?? productLine,
    });
    const tags = tagsFromRelativePath(file.relativePath, lineForFile);
    const materialCategory = inferMaterialCategory(file.relativePath, lineForFile);

    const assetId = randomUUID();
    const contentHash = hashFile(file.absolutePath);

    let parseStatus: SourceAssetRow["parse_status"] = "unsupported";
    let parseError: string | null = null;

    const adapter = isParseableExtension(ext) ? pickAdapter(ext) : null;

    const asset: SourceAssetRow = {
      asset_id: assetId,
      ingest_batch_id: ingestBatchId,
      source_system: TRAINING_SOURCE_SYSTEM || DEFAULT_SOURCE_SYSTEM,
      product_line: lineForFile,
      material_category: materialCategory,
      relative_path: file.relativePath,
      file_name: file.fileName,
      mime_type: mimeTypeForExtension(ext),
      file_size: file.size,
      content_hash: contentHash,
      gcs_uri: null,
      parse_status: "pending",
      parse_error: null,
      ingested_at: ingestedAt,
    };

    if (adapter) {
      const result = await adapter.parse(file, {
        ingestBatchId,
        assetId,
        asset,
        tags,
        ingestedAt,
        productLine: lineForFile,
      });
      parseStatus = result.parseStatus;
      parseError = result.parseError;
      allUnits.push(
        ...stampProductLine(dropGarbledUnits(result.units), lineForFile, materialCategory),
      );
      if (result.parseStatus === "pending") pendingParse += 1;
    } else {
      unsupported += 1;
      parseStatus = "unsupported";
      parseError = ext ? `未支援的副檔名: ${ext}` : "無副檔名";
    }

    asset.parse_status = parseStatus;
    asset.parse_error = parseError;
    assets.push(asset);
  }

  let unitsToInsert = allUnits;
  if (!options.skipDedupe && allUnits.length > 0) {
    const hashes = allUnits.map((u) => u.content_hash);
    const existing = await findExistingContentHashes(hashes);
    unitsToInsert = allUnits.filter((u) => {
      if (existing.has(u.content_hash)) {
        skippedDedupe += 1;
        return false;
      }
      return true;
    });
  }

  if (!options.dryRun) {
    const assetResult = await insertSourceAssetRows(assets);
    assetsInserted = assetResult.inserted;
    if (assetResult.insertErrors.length) {
      errors.push(...assetResult.insertErrors.map((e) => e.message));
    }

    if (unitsToInsert.length > 0) {
      const unitResult = await insertKnowledgeUnitRows(unitsToInsert);
      unitsInserted = unitResult.inserted;
      if (unitResult.insertErrors.length) {
        errors.push(...unitResult.insertErrors.map((e) => e.message));
      }
    }
  } else {
    assetsInserted = assets.length;
    unitsInserted = unitsToInsert.length;
  }

  return {
    ingestBatchId,
    productLine,
    rootDir: options.rootDir,
    discovered: files.length,
    assetsInserted,
    unitsInserted,
    pendingParse,
    unsupported,
    skippedDedupe,
    errors,
  };
}

/** 掃描 materialsRoot 下各車款子目錄，逐車款匯入 */
export async function runIngestAllProductLines(options: {
  materialsRoot: string;
  dryRun?: boolean;
  skipDedupe?: boolean;
}): Promise<IngestBatchReport[]> {
  const reports: IngestBatchReport[] = [];
  const batchId = randomUUID();

  for (const ent of readdirSync(options.materialsRoot, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (shouldIgnoreRelativePath(ent.name)) continue;
    const childRoot = path.join(options.materialsRoot, ent.name);
    const report = await runIngestBatch({
      rootDir: childRoot,
      materialsRoot: options.materialsRoot,
      productLine: ent.name,
      ingestBatchId: batchId,
      dryRun: options.dryRun,
      skipDedupe: options.skipDedupe,
    });
    reports.push(report);
  }

  return reports;
}
