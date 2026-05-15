import { NextResponse } from "next/server";
import { insertScriptDrillRows } from "@/lib/bq/script-drills-insert";
import { parseScriptDrillsFromBuffer } from "@/lib/ingest/parse-script-drills-xlsx";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

/** 上傳 xlsx → 解析 → BigQuery insertAll（staging） */
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
    return NextResponse.json({ error: "僅支援 .xlsx、.xls" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseScriptDrillsFromBuffer(buffer);

  if (!parsed.pickedSheet || parsed.rows.length === 0) {
    return NextResponse.json(
      {
        error: "無可匯入資料",
        dataRowCount: parsed.dataRowCount,
        warnings: parsed.warnings,
      },
      { status: 400 },
    );
  }

  try {
    const batchId = parsed.rows[0]?.ingest_batch_id;
    const insertResult = await insertScriptDrillRows(parsed.rows);
    return NextResponse.json({
      ok: true,
      fileName: file.name,
      ingestBatchId: batchId,
      pickedSheet: parsed.pickedSheet,
      headerRowIndex: parsed.headerRowIndex,
      dataRowCount: parsed.dataRowCount,
      warnings: parsed.warnings,
      bigquery: insertResult,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: message,
        pickedSheet: parsed.pickedSheet,
        dataRowCount: parsed.dataRowCount,
        warnings: parsed.warnings,
      },
      { status: 500 },
    );
  }
}
