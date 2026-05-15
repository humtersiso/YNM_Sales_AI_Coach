import fs from "fs";
import * as XLSX from "xlsx";
import {
  SCRIPT_DRILL_DISPLAY_HEADERS,
  SCRIPT_DRILL_HEADER_ALIASES,
} from "@/lib/ingest/script-drills-contract";

export type GridRow = {
  id: string;
  cols: Record<string, string>;
};

function asText(v: unknown) {
  return String(v ?? "").trim();
}

const GRID_DISPLAY_HEADERS = SCRIPT_DRILL_DISPLAY_HEADERS;
const GRID_HEADER_ALIASES = SCRIPT_DRILL_HEADER_ALIASES;

function normalizeHeaderText(v: unknown) {
  return asText(v).replace(/\s+/g, "");
}

function isHeaderMatch(text: string, aliases: string[]) {
  return aliases.some((a) => text.includes(a.replace(/\s+/g, "")));
}

export function readSheetColumnsGR(workbookPath: string, sheetName: string): GridRow[] {
  const buf = fs.readFileSync(workbookPath);
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
  if (rows.length < 2) return [];

  const header = rows[0] ?? [];
  const out: GridRow[] = [];
  const start = 6; // G
  const end = 17; // R

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r] ?? [];
    const cols: Record<string, string> = {};
    let hasAny = false;
    for (let c = start; c <= end; c += 1) {
      const key = asText(header[c]) || `欄位${String.fromCharCode(65 + c)}`;
      const val = asText(row[c]);
      cols[key] = val;
      if (val) hasAny = true;
    }
    if (!hasAny) continue;
    out.push({ id: `row-${r}`, cols });
  }
  return out;
}

export function readPreferredSheetColumnsGR(workbookPath: string, sheetNames: string[]): GridRow[] {
  for (const name of sheetNames) {
    const rows = readSheetColumnsGR(workbookPath, name);
    if (rows.length > 0) return rows;
  }
  return [];
}

export function readQuestionGridExact(workbookPath: string, sheetNames: string[]): GridRow[] {
  const buf = fs.readFileSync(workbookPath);
  const wb = XLSX.read(buf, { type: "buffer" });

  for (const sheetName of sheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
    if (aoa.length === 0) continue;

    let headerRowIdx = -1;
    let headerMap: Record<string, number[]> = {};

    for (let i = 0; i < Math.min(30, aoa.length); i += 1) {
      const row = aoa[i] ?? [];
      const map: Record<string, number[]> = {};
      for (let c = 0; c < row.length; c += 1) {
        const txt = normalizeHeaderText(row[c]);
        if (!txt) continue;
        for (const key of GRID_DISPLAY_HEADERS) {
          if (isHeaderMatch(txt, GRID_HEADER_ALIASES[key])) {
            const arr = map[key] ?? [];
            arr.push(c);
            map[key] = arr;
          }
        }
      }
      if (map["客戶疑問"] !== undefined && map["標準話術"] !== undefined) {
        headerRowIdx = i;
        headerMap = map;
        break;
      }
    }

    if (headerRowIdx < 0) continue;

    const rows: GridRow[] = [];
    for (let r = headerRowIdx + 1; r < aoa.length; r += 1) {
      const row = aoa[r] ?? [];
      const cols: Record<string, string> = {};
      let hasAny = false;

      for (const key of GRID_DISPLAY_HEADERS) {
        const idxs = headerMap[key] ?? [];
        let val = "";
        for (const idx of idxs) {
          const candidate = asText(row[idx]);
          if (candidate) {
            val = candidate;
            break;
          }
        }
        if (!val && idxs.length > 0) {
          val = asText(row[idxs[0]]);
        }
        cols[key] = val;
        if (val) hasAny = true;
      }

      if (!hasAny) continue;
      rows.push({ id: `${sheetName}-${r}`, cols });
    }
    return rows;
  }

  return [];
}
