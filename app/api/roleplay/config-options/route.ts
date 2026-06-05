import { NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import { getRoleplayConfigOptions } from "@/lib/roleplay/catalog";

export async function GET() {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  return NextResponse.json(getRoleplayConfigOptions());
}
