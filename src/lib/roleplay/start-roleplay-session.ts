import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { RoleplaySessionConfig } from "@/lib/roleplay/scenario-contract";

export type RoleplaySessionStartResult = {
  sessionId: string;
  customerMessage: string;
  maxTurns: number;
  turn: number;
  scenarioTitle?: string;
  agentSpeaksFirst?: boolean;
  coachMaterials?: {
    facts: { label: string; value: string }[];
    keyPoints: string[];
    forbidden: string[];
    sourceTitles?: string[];
    strategyIds?: string[];
  };
};

export { inferRoleplayProductLine, roleplaySessionConfigFromParts } from "@/lib/roleplay/roleplay-session-config";

export async function startRoleplaySession(
  config: RoleplaySessionConfig,
): Promise<RoleplaySessionStartResult | null> {
  try {
    const res = await fetch("/api/roleplay/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "custom", config }),
    });
    const data = (await res.json()) as RoleplaySessionStartResult & { error?: string };
    if (!res.ok) {
      const msg = data.error?.trim();
      if (msg) throw new Error(msg);
      return null;
    }
    if (!data.sessionId || !data.customerMessage?.trim()) return null;
    return data;
  } catch {
    return null;
  }
}

export function bootRoleplaySessionToStorage(
  sessionId: string,
  data: RoleplaySessionStartResult,
): void {
  sessionStorage.setItem(
    `roleplay-boot-${sessionId}`,
    JSON.stringify({
      customerMessage: data.customerMessage,
      plannedCustomerOpening: data.customerMessage,
      maxTurns: data.maxTurns,
      turn: data.turn,
      scenarioTitle: data.scenarioTitle,
      agentSpeaksFirst: data.agentSpeaksFirst ?? true,
      coachMaterials: data.coachMaterials,
    }),
  );
}

export async function retrySameRoleplayScenario(
  config: RoleplaySessionConfig,
  router: AppRouterInstance,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const data = await startRoleplaySession(config);
  if (!data) {
    return { ok: false, error: "情境建立失敗，請稍後再試" };
  }
  bootRoleplaySessionToStorage(data.sessionId, data);
  router.push(`/roleplay/practice?sessionId=${encodeURIComponent(data.sessionId)}`);
  return { ok: true, sessionId: data.sessionId };
}
