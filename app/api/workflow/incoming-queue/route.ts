import { NextRequest, NextResponse } from "next/server";
import {
  getStoredFileAbsolute,
  listIncomingQueue,
  markIncomingQueueStatus,
  readActiveIncomingBuffer,
  selectIncomingQueueItem,
} from "@/lib/incoming-queue";
import { loadIncomingWorkbookForCheckFromBuffer } from "@/lib/excel-store/store";
import { readQuestionGridExact } from "@/lib/excel-store/grid-reader";

export async function GET() {
  try {
    const items = listIncomingQueue();
    const active = readActiveIncomingBuffer();
    return NextResponse.json({
      items,
      activeId: active?.item.id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "讀取匯入佇列失敗" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
  };

  try {
    if (body.action === "select" && body.id) {
      const { buffer, item } = selectIncomingQueueItem(body.id);
      const incoming = loadIncomingWorkbookForCheckFromBuffer(buffer, item.fileName);
      const abs = getStoredFileAbsolute(item.storedFile);
      const rowsGR = readQuestionGridExact(abs, ["問題蒐集對應", "「問題蒐集對應」整理版"]);
      return NextResponse.json({
        ok: true,
        preview: {
          workbookPath: incoming.workbookPath,
          loadedAt: incoming.loadedAt,
          itemCount: incoming.items.length,
          missingCodes: incoming.missingCodes,
          expertCodes: incoming.expertCodes,
          previewItems: incoming.items.slice(0, 10),
          rowsGR,
        },
      });
    }

    if (body.action === "done" && body.id) {
      markIncomingQueueStatus(body.id, "done");
      return NextResponse.json({ ok: true });
    }

    if (body.action === "discard" && body.id) {
      markIncomingQueueStatus(body.id, "discarded");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "不支援的操作" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "匯入佇列操作失敗" },
      { status: 400 },
    );
  }
}
