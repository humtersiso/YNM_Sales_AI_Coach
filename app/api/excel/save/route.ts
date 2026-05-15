import { NextResponse } from "next/server";
import { ensureStoreLoaded, saveStoreToWorkbook } from "@/lib/excel-store/store";

export async function POST() {
  try {
    ensureStoreLoaded();
    const { path, backupPath, mergedCount } = saveStoreToWorkbook();
    return NextResponse.json({
      ok: true,
      path,
      backupPath,
      mergedCount,
      message: `${backupPath ? `已寫入並備份：${backupPath}` : `已寫入：${path}`}（本次轉正式題庫 ${mergedCount} 筆）`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "儲存失敗",
      },
      { status: 500 },
    );
  }
}
