import * as XLSX from "xlsx";
import { applyMergesToAoa, ensureRectangular } from "./parse-script-drills-xlsx";

function asText(v: unknown): string {
  return String(v ?? "").trim();
}

export type GenericXlsxRow = {
  sheet: string;
  row: number;
  question: string;
  script: string;
};

export type GenericXlsxParseResult = {
  rows: GenericXlsxRow[];
  warnings: string[];
};

function rowHasData(row: (string | number | undefined)[]): boolean {
  return row.some((c) => asText(c).length > 0);
}

function buildRowScript(
  headerRow: string[],
  row: (string | number | undefined)[],
  useHeaders: boolean,
): string {
  const cells = row.map((c) => asText(c)).filter(Boolean);
  if (!useHeaders) return cells.join(" | ");
  const parts: string[] = [];
  const maxCols = Math.max(headerRow.length, row.length);
  for (let c = 0; c < maxCols; c += 1) {
    const val = asText(row[c]);
    if (!val) continue;
    const label = headerRow[c]?.trim() || `欄${c + 1}`;
    parts.push(`${label}: ${val}`);
  }
  return parts.join("\n");
}

function headerLooksLikeLabels(headerRow: string[]): boolean {
  if (!headerRow.some((h) => h.length > 0)) return false;
  const nonEmpty = headerRow.filter((h) => h.length > 0);
  if (nonEmpty.length < 2) return false;
  const avgLen =
    nonEmpty.reduce((sum, h) => sum + h.length, 0) / Math.max(nonEmpty.length, 1);
  if (avgLen > 80) return false;
  const numericOnly = nonEmpty.every((h) => /^[\d.,%\-+]+$/.test(h));
  return !numericOnly;
}

/**
 * 非話術演練表頭的 xlsx：逐列抽出可讀文字（table_row 來源）
 */
export function parseGenericXlsxFromBuffer(buffer: Buffer): GenericXlsxParseResult {
  const warnings: string[] = [];
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const rows: GenericXlsxRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
    applyMergesToAoa(sheet, aoa as (string | number | undefined)[][]);
    ensureRectangular(aoa as (string | number | undefined)[][]);
    if (aoa.length === 0) continue;

    const headerRow = (aoa[0] ?? []).map((c) => asText(c));
    const useHeaders = headerLooksLikeLabels(headerRow);
    const startRow = useHeaders ? 1 : 0;

    for (let r = startRow; r < aoa.length; r += 1) {
      const row = aoa[r] ?? [];
      if (!rowHasData(row)) continue;
      const script = buildRowScript(headerRow, row, useHeaders);
      if (!script.trim()) continue;
      const cells = row.map((c) => asText(c)).filter(Boolean);
      const question = cells[0]?.slice(0, 200) || `${sheetName} 第${r + 1}列`;
      rows.push({ sheet: sheetName, row: r + 1, question, script });
    }
  }

  if (rows.length === 0) {
    warnings.push("工作表無可解析的資料列");
  }

  return { rows, warnings };
}
