import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AdapterContext, AdapterParseResult, DiscoveredFile, SourceAdapter } from "./base-source-adapter";
import type { KnowledgeUnitRow } from "@/lib/ingest/contracts/knowledge-unit-contract";
import { locatorToJson } from "@/lib/ingest/contracts/knowledge-unit-contract";
import { inferMaterialCategory } from "@/lib/ingest/contracts/material-category-contract";
import { parseGenericXlsxFromBuffer } from "@/lib/ingest/parse-generic-xlsx";
import { parseScriptDrillsFromBuffer } from "@/lib/ingest/parse-script-drills-xlsx";
import { buildTableRowSearchQuestion } from "@/lib/ingest/chunk-search-text";
import { isGarbledText, normalizeKnowledgeText } from "@/lib/ingest/text-normalize";

function contentHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 32);
}

function sanitizeFields(question: string, script: string): { question: string; script: string } | null {
  const q = normalizeKnowledgeText(question);
  const s = normalizeKnowledgeText(script);
  if (!q && !s) return null;
  if (isGarbledText(q) || isGarbledText(s)) return null;
  return { question: q, script: s };
}

function drillRowsToUnits(
  parsed: Awaited<ReturnType<typeof parseScriptDrillsFromBuffer>>,
  ctx: AdapterContext,
  materialCategory: ReturnType<typeof inferMaterialCategory>,
): KnowledgeUnitRow[] {
  const units: KnowledgeUnitRow[] = [];
  for (const row of parsed.rows) {
    const cleaned = sanitizeFields(row.customer_question?.trim() || "", row.standard_script?.trim() || "");
    if (!cleaned) continue;

    const locator = locatorToJson({ sheet: row.source_sheet, row: row.source_row });
    const hashInput = [ctx.productLine, ctx.assetId, cleaned.question, cleaned.script, locator ?? ""].join("|");

    units.push({
      unit_id: randomUUID(),
      ingest_batch_id: ctx.ingestBatchId,
      asset_id: ctx.assetId,
      product_line: ctx.productLine,
      material_category: materialCategory === "general" ? "sales_script" : materialCategory,
      unit_type: cleaned.question ? "qa_pair" : "table_row",
      title: row.source_sheet || null,
      customer_question: cleaned.question || cleaned.script.slice(0, 120) || null,
      standard_script: cleaned.script || cleaned.question || null,
      source_locator: locator,
      tags: ctx.tags,
      language: "zh-TW",
      content_hash: contentHash([hashInput]),
      ingested_at: ctx.ingestedAt,
    });
  }
  return units;
}

function genericRowsToUnits(
  parsed: Awaited<ReturnType<typeof parseGenericXlsxFromBuffer>>,
  ctx: AdapterContext,
  materialCategory: ReturnType<typeof inferMaterialCategory>,
  file: DiscoveredFile,
): KnowledgeUnitRow[] {
  const units: KnowledgeUnitRow[] = [];
  for (const row of parsed.rows) {
    const cleaned = sanitizeFields(row.question, row.script);
    if (!cleaned) continue;

    const locator = locatorToJson({ sheet: row.sheet, row: row.row });
    const hashInput = [ctx.productLine, ctx.assetId, cleaned.question, cleaned.script, locator ?? ""].join("|");

    units.push({
      unit_id: randomUUID(),
      ingest_batch_id: ctx.ingestBatchId,
      asset_id: ctx.assetId,
      product_line: ctx.productLine,
      material_category: materialCategory === "general" ? "product_info" : materialCategory,
      unit_type: "table_row",
      title: `${file.fileName} / ${row.sheet}`,
      customer_question: buildTableRowSearchQuestion(file.fileName, row.sheet, cleaned.script),
      standard_script: cleaned.script.slice(0, 15000),
      source_locator: locator,
      tags: ctx.tags,
      language: "zh-TW",
      content_hash: contentHash([hashInput]),
      ingested_at: ctx.ingestedAt,
    });
  }
  return units;
}

export const xlsxAdapter: SourceAdapter = {
  extensions: [".xlsx", ".xls"],
  canHandle(ext: string) {
    return this.extensions.includes(ext as ".xlsx" | ".xls");
  },
  async parse(file: DiscoveredFile, ctx: AdapterContext): Promise<AdapterParseResult> {
    const materialCategory = inferMaterialCategory(file.relativePath, ctx.productLine, {
      defaultCategory: "sales_script",
    });
    try {
      const buffer = readFileSync(file.absolutePath);
      const parsed = parseScriptDrillsFromBuffer(buffer);

      if (parsed.rows.length > 0) {
        const units = drillRowsToUnits(parsed, ctx, materialCategory);
        if (units.length === 0) {
          return { units: [], parseStatus: "failed", parseError: "話術列皆為空或含亂碼" };
        }
        return {
          units,
          parseStatus: "ok",
          parseError: parsed.warnings.length ? parsed.warnings.map((w) => w.message).join("; ") : null,
        };
      }

      const generic = parseGenericXlsxFromBuffer(buffer);
      const units = genericRowsToUnits(generic, ctx, materialCategory, file);
      if (units.length === 0) {
        const hint = generic.warnings.join("; ") || parsed.warnings.map((w) => w.message).join("; ");
        return {
          units: [],
          parseStatus: "failed",
          parseError: hint || "無法解析 Excel 內容（非話術表且無資料列）",
        };
      }

      return {
        units,
        parseStatus: "ok",
        parseError: "表頭非話術演練格式，已依列解析為 table_row",
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { units: [], parseStatus: "failed", parseError: msg };
    }
  },
};
