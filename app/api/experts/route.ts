import { NextRequest, NextResponse } from "next/server";
import { createExpert, deleteExpert, listExperts, reloadStoreFromDisk, updateExpert } from "@/lib/excel-store/store";

export async function GET() {
  try {
    reloadStoreFromDisk();
    const experts = listExperts();
    return NextResponse.json({ experts });
  } catch {
    return NextResponse.json(
      {
        error:
          "無法載入資料。請確認 web/data/ 內有 AI話術演練表.xlsx，或設定 EXCEL_MAIN_PATH。",
        experts: [],
      },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    code?: string;
    name?: string;
    email?: string;
    groupName?: string;
    isActive?: boolean;
  };
  try {
    const expert = createExpert({
      code: body.code ?? "",
      name: body.name ?? "",
      email: body.email ?? "",
      groupName: body.groupName,
      isActive: body.isActive,
    });
    return NextResponse.json({ expert });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法新增專家。" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    id: string;
    code?: string;
    name?: string;
    email?: string;
    groupName?: string;
    isActive?: boolean;
  };

  if (!body.id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }

  try {
    const expert = updateExpert(body.id, {
      name: body.name,
      code: body.code,
      email: body.email,
      groupName: body.groupName,
      isActive: body.isActive,
    });
    return NextResponse.json({ expert });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法更新專家。" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  try {
    const result = deleteExpert(body.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法刪除專家。" }, { status: 400 });
  }
}
