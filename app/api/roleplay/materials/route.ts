import { NextRequest, NextResponse } from "next/server";
import {
  MATERIAL_CATEGORIES,
  type MaterialCategory,
} from "@/lib/ingest/contracts/material-category-contract";
import { listRoleplayMaterials } from "@/lib/roleplay/list-roleplay-materials";

function parseCategory(raw: string | null): MaterialCategory | null {
  if (!raw?.trim()) return null;
  const v = raw.trim() as MaterialCategory;
  return (MATERIAL_CATEGORIES as readonly string[]).includes(v) ? v : null;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const productLine = sp.get("productLine");
  const materialCategory = parseCategory(sp.get("materialCategory"));
  const limitRaw = Number(sp.get("limit") ?? "80");

  try {
    const data = await listRoleplayMaterials({
      productLine,
      materialCategory,
      limit: Number.isFinite(limitRaw) ? limitRaw : 80,
    });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "讀取素材失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
