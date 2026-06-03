import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import {
  SCRIPT_DRILL_BQ_FIELDS,
  SCRIPT_DRILL_DISPLAY_HEADERS,
  SCRIPT_DRILL_HEADER_ALIASES,
  SCRIPT_DRILL_HEADER_SCAN_MAX_ROWS,
  SCRIPT_DRILL_PREFERRED_SHEETS,
} from "./script-drills-contract";

function asText(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeHeaderText(v: unknown) {
  return asText(v).replace(/\s+/g, "");
}

function isHeaderMatch(text: string, aliases: string[]) {
  return aliases.some((a) => text.includes(a.replace(/\s+/g, "")));
}

type Merge = { s: { r: number; c: number }; e: { r: number; c: number } };

/** 將合併儲存格左上角值填滿合併範圍，避免下游讀到空字串 */
export function applyMergesToAoa(sheet: XLSX.WorkSheet, aoa: (string | number | undefined)[][]) {
  const merges = sheet["!merges"] as Merge[] | undefined;
  if (!merges?.length) return;
  for (const m of merges) {
    const sr = m.s.r;
    const sc = m.s.c;
    const er = m.e.r;
    const ec = m.e.c;
    const base = aoa[sr]?.[sc];
    const fill = base === undefined || base === "" ? null : String(base);
    if (fill === null) continue;
    for (let r = sr; r <= er; r += 1) {
      if (!aoa[r]) aoa[r] = [];
      for (let c = sc; c <= ec; c += 1) {
        const cur = aoa[r][c];
        if (cur === undefined || cur === "" || String(cur).trim() === "") {
          aoa[r][c] = fill;
        }
      }
    }
  }
}

export function ensureRectangular(aoa: (string | number | undefined)[][]) {
  let maxC = 0;
  for (const row of aoa) maxC = Math.max(maxC, row?.length ?? 0);
  for (const row of aoa) {
    while (row.length < maxC) row.push("");
  }
}

export type ScriptDrillParseWarning = {
  code: string;
  message: string;
};

export type ScriptDrillBqRow = {
  ingest_batch_id: string;
  ingested_at: string;
  source_sheet: string;
  source_row: number;
  customer_question: string | null;
  standard_script: string | null;
  reviewer_es: string | null;
  reviewer_ul: string | null;
  reviewer_yj: string | null;
  reviewer_em: string | null;
  reviewer_yf: string | null;
  reviewer_hl: string | null;
  reviewer_kt: string | null;
  reviewer_ya: string | null;
  msd_confirmation: string | null;
};

export type ScriptDrillParseResult = {
  pickedSheet: string;
  headerRowIndex: number;
  dataRowCount: number;
  warnings: ScriptDrillParseWarning[];
  rows: ScriptDrillBqRow[];
  sampleDisplayRows: Record<string, string>[];
};

function collectDuplicateNormalizedHeaderWarnings(
  sheetName: string,
  headerRow: (string | number)[],
  headerRowIdx: number,
): ScriptDrillParseWarning[] {
  const warnings: ScriptDrillParseWarning[] = [];
  const rawSeen = new Map<string, number[]>();
  for (let c = 0; c < headerRow.length; c += 1) {
    const n = normalizeHeaderText(headerRow[c]);
    if (!n) continue;
    const arr = rawSeen.get(n) ?? [];
    arr.push(c);
    rawSeen.set(n, arr);
  }
  for (const cols of rawSeen.values()) {
    if (cols.length > 1) {
      warnings.push({
        code: "duplicate_header_cell",
        message: `工作表「${sheetName}」第 ${headerRowIdx + 1} 列有 ${cols.length} 欄正規化後表頭相同（欄位索引 0-based：${cols.join(", ")}），物件型解析會覆蓋欄位；本管線使用欄位索引故仍保留各欄`,
      });
    }
  }
  return warnings;
}

function findSheetAndHeader(wb: XLSX.WorkBook): {
  sheetName: string;
  sheet: XLSX.WorkSheet;
  headerRowIdx: number;
  headerMap: Record<string, number[]>;
} | null {
  const preferred = new Set<string>(SCRIPT_DRILL_PREFERRED_SHEETS as unknown as string[]);
  const tryOrder = [
    ...(SCRIPT_DRILL_PREFERRED_SHEETS as unknown as string[]),
    ...wb.SheetNames.filter((n) => !preferred.has(n)),
  ];
  const seen = new Set<string>();
  const orderedNames = tryOrder.filter((n) => {
    if (!wb.Sheets[n] || seen.has(n)) return false;
    seen.add(n);
    return true;
  });

  for (const sheetName of orderedNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
    applyMergesToAoa(sheet, aoa as (string | number | undefined)[][]);
    ensureRectangular(aoa as (string | number | undefined)[][]);

    for (let i = 0; i < Math.min(SCRIPT_DRILL_HEADER_SCAN_MAX_ROWS, aoa.length); i += 1) {
      const row = aoa[i] ?? [];
      const map: Record<string, number[]> = {};
      for (let c = 0; c < row.length; c += 1) {
        const txt = normalizeHeaderText(row[c]);
        if (!txt) continue;
        for (const key of SCRIPT_DRILL_DISPLAY_HEADERS) {
          if (isHeaderMatch(txt, SCRIPT_DRILL_HEADER_ALIASES[key])) {
            const arr = map[key] ?? [];
            arr.push(c);
            map[key] = arr;
          }
        }
      }
      if (map["客戶疑問"] !== undefined && map["標準話術"] !== undefined) {
        return { sheetName, sheet, headerRowIdx: i, headerMap: map };
      }
    }
  }
  return null;
}

/**
 * 從緩衝區解析話術演練格狀表；列資料使用合併儲存格填滿後再以表頭索引取值，避免 sheet_to_json 物件模式吃掉重複欄名。
 * @param options.previewMaxRows 若設定，只建立前 N 筆資料列（仍會掃描至資料結尾以計算 dataRowCount）
 */
export function parseScriptDrillsFromBuffer(
  buffer: Buffer,
  options?: { previewMaxRows?: number },
): ScriptDrillParseResult {
  const warnings: ScriptDrillParseWarning[] = [];
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const found = findSheetAndHeader(wb);
  if (!found) {
    return {
      pickedSheet: "",
      headerRowIndex: -1,
      dataRowCount: 0,
      warnings: [
        {
          code: "no_matching_sheet",
          message: "找不到含「客戶疑問」與「標準話術」（或別名）表頭的工作表",
        },
      ],
      rows: [],
      sampleDisplayRows: [],
    };
  }

  const { sheetName, sheet, headerRowIdx, headerMap } = found;
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
  applyMergesToAoa(sheet, aoa as (string | number | undefined)[][]);
  ensureRectangular(aoa as (string | number | undefined)[][]);

  const headerRow = aoa[headerRowIdx] ?? [];
  warnings.push(...collectDuplicateNormalizedHeaderWarnings(sheetName, headerRow, headerRowIdx));

  const batchId = randomUUID();
  const ingestedAt = new Date().toISOString();
  const previewMax = options?.previewMaxRows;

  const dataRows: ScriptDrillBqRow[] = [];
  const sampleDisplayRows: Record<string, string>[] = [];
  let totalNonEmpty = 0;

  for (let r = headerRowIdx + 1; r < aoa.length; r += 1) {
    const row = aoa[r] ?? [];
    const display: Record<string, string> = {};
    let hasAny = false;
    for (const key of SCRIPT_DRILL_DISPLAY_HEADERS) {
      const idxs = headerMap[key] ?? [];
      let val = "";
      for (const idx of idxs) {
        const candidate = asText(row[idx]);
        if (candidate) {
          val = candidate;
          break;
        }
      }
      if (!val && idxs.length > 0) val = asText(row[idxs[0]]);
      display[key] = val;
      if (val) hasAny = true;
    }
    if (!hasAny) continue;

    totalNonEmpty += 1;

    if (sampleDisplayRows.length < 5) {
      sampleDisplayRows.push({ ...display });
    }

    if (previewMax === undefined || dataRows.length < previewMax) {
      const bqRow: Record<string, string | number | null> = {
        ingest_batch_id: batchId,
        ingested_at: ingestedAt,
        source_sheet: sheetName,
        source_row: r + 1,
      };
      for (const key of SCRIPT_DRILL_DISPLAY_HEADERS) {
        bqRow[SCRIPT_DRILL_BQ_FIELDS[key]] = display[key] || null;
      }
      dataRows.push(bqRow as unknown as ScriptDrillBqRow);
    }
  }

  return {
    pickedSheet: sheetName,
    headerRowIndex: headerRowIdx,
    dataRowCount: totalNonEmpty,
    warnings,
    rows: dataRows,
    sampleDisplayRows,
  };
}
