import { NextResponse } from "next/server";
import { ensureStoreLoaded, getMainWorkbookSummary, loadWorkbookFromBuffer } from "@/lib/excel-store/store";
import { readQuestionGridExact } from "@/lib/excel-store/grid-reader";

export async function GET() {
  try {
    ensureStoreLoaded();
    const summary = getMainWorkbookSummary();
    const rowsGR = readQuestionGridExact(summary.workbookPath, [
      "問題蒐集對應",
      "「問題蒐集對應」整理版",
      "問題蒐集對應(備份)",
    ]);
    return NextResponse.json({
      ...summary,
      rowsGR,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "讀取主庫失敗",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少上傳檔案" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const state = loadWorkbookFromBuffer(buffer, file.name || "uploaded-main.xlsx");
    const summary = getMainWorkbookSummary();
    const rowsGR = readQuestionGridExact(state.workbookPath, [
      "問題蒐集對應",
      "「問題蒐集對應」整理版",
      "問題蒐集對應(備份)",
    ]);
    return NextResponse.json({
      ...summary,
      rowsGR,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "匯入主庫資料失敗" },
      { status: 500 },
    );
  }
}
