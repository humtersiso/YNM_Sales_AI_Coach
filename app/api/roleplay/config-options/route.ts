import { NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import {
  getRoleplayConfigOptions,
  getRoleplayConfigOptionsSync,
  staticCompetitorsForProduct,
} from "@/lib/roleplay/catalog";

export async function GET() {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getRoleplayConfigOptions());
  } catch (e) {
    console.error("[roleplay] config-options failed", e);
    const base = getRoleplayConfigOptionsSync();
    const competitorsByProduct: Record<string, string[]> = {};
    for (const p of base.products) {
      competitorsByProduct[p.id] = staticCompetitorsForProduct(p.id);
    }
    const defaultProduct = base.products[0]?.id;
    return NextResponse.json({
      ...base,
      competitors: defaultProduct ? (competitorsByProduct[defaultProduct] ?? []) : [],
      competitorsByProduct,
    });
  }
}
