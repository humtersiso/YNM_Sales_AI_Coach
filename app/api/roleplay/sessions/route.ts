import { NextRequest, NextResponse } from "next/server";
import { readRoleplayUser } from "@/lib/roleplay/auth";
import {
  RoleplaySessionError,
  startRoleplaySession,
  startRoleplaySessionWithConfig,
} from "@/lib/roleplay/engine/session-service";

export async function POST(request: NextRequest) {
  const user = await readRoleplayUser();
  if (!user) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    scenarioId?: string;
    personaId?: string;
    mode?: "custom" | "random" | "demo";
    config?: Record<string, unknown>;
  };

  try {
    if (body.scenarioId?.trim() && body.mode !== "custom" && body.mode !== "random") {
      const result = await startRoleplaySession({
        scenarioId: body.scenarioId.trim(),
        personaId: body.personaId?.trim(),
        user,
      });
      return NextResponse.json(result);
    }

    const mode = body.mode === "random" ? "random" : "custom";
    const result = await startRoleplaySessionWithConfig({
      mode,
      config: body.config ?? body,
      user,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof RoleplaySessionError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
