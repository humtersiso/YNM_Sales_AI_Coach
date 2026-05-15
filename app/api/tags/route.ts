import { NextResponse } from "next/server";
import { listTags } from "@/lib/excel-store/store";

export async function GET() {
  const tags = listTags();
  return NextResponse.json({ tags });
}
