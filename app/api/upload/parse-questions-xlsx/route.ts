import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

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
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
    return NextResponse.json({ error: "僅支援 .xlsx、.xls、.csv" }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "無法讀取試算表格式" }, { status: 400 });
  }

  const firstName = workbook.SheetNames[0];
  if (!firstName) {
    return NextResponse.json({ error: "工作簿沒有任何工作表" }, { status: 400 });
  }

  const sheet = workbook.Sheets[firstName];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });
  const lines = rows.map((row) => String(row[0] ?? "").trim()).filter(Boolean);

  return NextResponse.json({ lines });
}
