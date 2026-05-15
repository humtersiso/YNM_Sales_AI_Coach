import { NextResponse } from "next/server";
import {
  enqueueIncomingFile,
  getStoredFileAbsolute,
  readActiveIncomingBuffer,
} from "@/lib/incoming-queue";
import { getIncomingPreview, loadIncomingWorkbookForCheck, loadIncomingWorkbookForCheckFromBuffer } from "@/lib/excel-store/store";
import { readQuestionGridExact } from "@/lib/excel-store/grid-reader";

export async function GET() {
  return NextResponse.json({ incoming: getIncomingPreview() });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let incoming;
    let rowsGR: Array<{ id: string; cols: Record<string, string> }> = [];
    let queueItemId: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "缺少上傳檔案" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const qItem = enqueueIncomingFile(buffer, file.name || "uploaded.xlsx", { setActive: true });
      queueItemId = qItem.id;
      incoming = loadIncomingWorkbookForCheckFromBuffer(buffer, qItem.fileName);
      const abs = getStoredFileAbsolute(qItem.storedFile);
      rowsGR = readQuestionGridExact(abs, ["問題蒐集對應", "「問題蒐集對應」整理版"]);
    } else {
      const active = readActiveIncomingBuffer();
      if (active) {
        incoming = loadIncomingWorkbookForCheckFromBuffer(active.buffer, active.item.fileName);
        const abs = getStoredFileAbsolute(active.item.storedFile);
        rowsGR = readQuestionGridExact(abs, ["問題蒐集對應", "「問題蒐集對應」整理版"]);
      } else {
        incoming = loadIncomingWorkbookForCheck();
        rowsGR = readQuestionGridExact(incoming.workbookPath, ["問題蒐集對應", "「問題蒐集對應」整理版"]);
      }
    }

    return NextResponse.json({
      workbookPath: incoming.workbookPath,
      loadedAt: incoming.loadedAt,
      itemCount: incoming.items.length,
      missingCodes: incoming.missingCodes,
      expertCodes: incoming.expertCodes,
      previewItems: incoming.items.slice(0, 10),
      rowsGR,
      queueItemId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "載入待比對資料失敗",
      },
      { status: 500 },
    );
  }
}
