import type {
  RoleplayScenario,
  RoleplayScenarioDetailView,
  RoleplayScenarioPublicView,
} from "@/lib/roleplay/scenario-contract";
import { DEMO_ROLEPLAY_SCENARIOS } from "@/lib/roleplay/seed/demo-scenarios";
import { ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";

function toPublicView(s: RoleplayScenario): RoleplayScenarioPublicView {
  return {
    scenarioId: s.scenarioId,
    title: s.sectionA.title,
    productDisplayName: s.sectionA.productDisplayName,
    competitor: s.sectionA.competitor,
    coreIssue: s.sectionA.coreIssue,
    difficulty: s.sectionE.difficulty,
    maxTurns: s.sectionE.maxTurns,
    personaId: s.sectionE.personaId,
    openingLine: s.sectionB.openingLine,
    factCount: s.sectionC.facts.length,
    keyPointCount: s.sectionD.keyPoints.length,
  };
}

function toDetailView(s: RoleplayScenario): RoleplayScenarioDetailView {
  const pub = toPublicView(s);
  return {
    ...pub,
    sectionB: {
      openingLine: s.sectionB.openingLine,
      followUpCount: s.sectionB.followUps.length,
    },
    sectionC: s.sectionC,
    sectionD: {
      keyPoints: s.sectionD.keyPoints,
      closingActions: s.sectionD.closingActions,
      forbiddenCount: s.sectionD.forbidden.length,
    },
    sectionE: s.sectionE,
  };
}

export function listRoleplayScenarios(): RoleplayScenarioPublicView[] {
  return DEMO_ROLEPLAY_SCENARIOS.map(toPublicView);
}

export function getRoleplayScenario(scenarioId: string): RoleplayScenario | null {
  return DEMO_ROLEPLAY_SCENARIOS.find((s) => s.scenarioId === scenarioId) ?? null;
}

export function getRoleplayScenarioDetail(
  scenarioId: string,
): RoleplayScenarioDetailView | null {
  const s = getRoleplayScenario(scenarioId);
  return s ? toDetailView(s) : null;
}

export function getRoleplayGlobalConfig() {
  return ROLEPLAY_GLOBAL_CONFIG;
}

export function resolvePersona(personaId: string) {
  return (
    ROLEPLAY_GLOBAL_CONFIG.personas.find((p) => p.id === personaId) ??
    ROLEPLAY_GLOBAL_CONFIG.personas.find((p) => p.id === "P-01") ??
    ROLEPLAY_GLOBAL_CONFIG.personas[0]
  );
}
