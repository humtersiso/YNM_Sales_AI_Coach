import { NextRequest, NextResponse } from "next/server";
import {
  fetchMainWorkbookFromBq,
  getAdminFilterOptions,
  isBigQueryConfigured,
} from "@/lib/bq/script-drills-query";
import type { MaterialCategory } from "@/lib/ingest/contracts/material-category-contract";

async function loadFromBigQuery(searchParams: URLSearchParams) {
  const productLine = searchParams.get("productLine")?.trim() || null;
  const materialCategory = (searchParams.get("materialCategory")?.trim() ||
    null) as MaterialCategory | null;
  const bq = await fetchMainWorkbookFromBq({
    productLine,
    materialCategory,
  });
  return {
    workbookPath: bq.dataSourceLabel,
    duplicateCount: bq.duplicateCount,
    pendingCount: bq.pendingCount,
    expertCount: bq.expertCount,
    tagCount: bq.tagCount,
    rowsGR: bq.rowsGR,
    dataSource: bq.source,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!isBigQueryConfigured()) {
      return NextResponse.json(
        {
          error:
            "未設定 BigQuery（請在 .env 設定 BIGQUERY_PROJECT_ID、BIGQUERY_DATASET、BIGQUERY_TABLE_SCRIPT_DRILLS）。",
        },
        { status: 503 },
      );
    }
    const data = await loadFromBigQuery(request.nextUrl.searchParams);
    return NextResponse.json({ ...data, filterOptions: getAdminFilterOptions() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "讀取 BigQuery 題庫失敗";
    console.error("BigQuery main overview failed", error);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

/** 主庫改由 BQ 管理；Excel 上傳請使用「匯入與檢查」或 /api/ingest/script-drills */
export async function POST() {
  return NextResponse.json(
    {
      error: "題庫已改由 BigQuery 管理，請至「匯入與檢查」上傳檔案，或使用話術匯入 API 寫入 BQ。",
    },
    { status: 400 },
  );
}
