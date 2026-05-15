import { NextResponse } from "next/server";
import { parseScriptDrillsFromBuffer } from "@/lib/ingest/parse-script-drills-xlsx";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * 上傳 xlsx，回傳表頭列、列數、警告與樣本列（不寫入 BigQuery）。
 * Query: maxRows — 回傳的 BQ 形列筆數上限（預設 100，僅縮小 payload；dataRowCount 仍為全檔筆數）
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "無法解析上傳內容" }, { status: 400 });
  }

  const entry = formData.get("file");
  if (!entry || typeof entry === "string") {
    return NextResponse.json({ error: "請以 multipart 欄位 file 上傳檔案" }, { status: 400 });
  }

  const file = entry as File;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `檔案過大（上限 ${MAX_BYTES / 1024 / 1024} MB）` }, { status: 400 });
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return NextResponse.json({ error: "預覽僅支援 .xlsx、.xls" }, { status: 400 });
  }

  const maxRowsParam = new URL(request.url).searchParams.get("maxRows");
  const maxRows = Math.min(2000, Math.max(1, Number(maxRowsParam ?? "100") || 100));

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseScriptDrillsFromBuffer(buffer, { previewMaxRows: maxRows });

  return NextResponse.json({
    fileName: file.name,
    pickedSheet: parsed.pickedSheet,
    headerRowIndex: parsed.headerRowIndex,
    dataRowCount: parsed.dataRowCount,
    warnings: parsed.warnings,
    sampleDisplayRows: parsed.sampleDisplayRows,
    rowsPreview: parsed.rows,
    rowsPreviewNote: `最多 ${maxRows} 筆；dataRowCount 為全檔非空資料列總數`,
  });
}
