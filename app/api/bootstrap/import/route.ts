import { NextResponse } from "next/server";
import { importCountsFromReload } from "@/lib/excel-store/store";

export async function POST() {
  try {
    const result = importCountsFromReload();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "匯入失敗",
      },
      { status: 500 },
    );
  }
}
