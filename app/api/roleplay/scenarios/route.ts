import { NextResponse } from "next/server";
import {
  getRoleplayGlobalConfig,
  listRoleplayScenarios,
} from "@/lib/roleplay/scenario-repository";

export async function GET() {
  return NextResponse.json({
    scenarios: listRoleplayScenarios(),
    globalConfig: {
      personas: getRoleplayGlobalConfig().personas.map((p) => ({
        id: p.id,
        name: p.name,
        style: p.style,
      })),
      rubricDimensions: getRoleplayGlobalConfig().rubricDimensions,
      gradeBands: getRoleplayGlobalConfig().gradeBands,
    },
  });
}
