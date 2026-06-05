import { NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import { getRoleplayRagSupportedProducts } from "@/lib/roleplay/roleplay-rag-products";

export async function GET() {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  return NextResponse.json(getRoleplayRagSupportedProducts());
}
