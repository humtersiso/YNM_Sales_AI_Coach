import { NextRequest, NextResponse } from "next/server";
import { getRoleplayScenarioDetail } from "@/lib/roleplay/scenario-repository";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const detail = getRoleplayScenarioDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "找不到情境" }, { status: 404 });
  }
  return NextResponse.json({ scenario: detail });
}
