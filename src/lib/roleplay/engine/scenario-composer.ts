import { randomUUID } from "node:crypto";
import { getProductLine } from "@/lib/ingest/contracts/training-product-registry";
import {
  clampTurns,
  isAllowedProductLine,
  pickRandom,
  ROLEPLAY_AGE_RANGES,
  ROLEPLAY_COMPETITORS_XTRAIL,
  ROLEPLAY_DIFFICULTIES,
} from "@/lib/roleplay/catalog";
import { generateRoleplayOpeningBrief } from "@/lib/roleplay/engine/opening-generator";
import type {
  RoleplayAgeRange,
  RoleplayDrillDifficulty,
  RoleplayScenario,
  RoleplaySessionConfig,
} from "@/lib/roleplay/scenario-contract";
import { ROLEPLAY_PERSONA_IDS } from "@/lib/roleplay/seed/global-config";
import { fetchRoleplayRagContext } from "@/lib/roleplay/rag-context";
import { ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";

export function randomRoleplayConfig(
  partial?: Partial<RoleplaySessionConfig>,
): RoleplaySessionConfig {
  return {
    productLine: partial?.productLine ?? "xtrail-ice",
    personaId: partial?.personaId ?? pickRandom(ROLEPLAY_PERSONA_IDS),
    ageRange: partial?.ageRange ?? pickRandom(ROLEPLAY_AGE_RANGES).id,
    competitor: partial?.competitor ?? pickRandom(ROLEPLAY_COMPETITORS_XTRAIL),
    maxTurns: clampTurns(partial?.maxTurns ?? 5),
    difficulty: partial?.difficulty ?? pickRandom(ROLEPLAY_DIFFICULTIES).id,
  };
}

export function parseSessionConfig(body: Record<string, unknown>): RoleplaySessionConfig {
  const productLine = String(body.productLine ?? "xtrail-ice").trim();
  if (!isAllowedProductLine(productLine)) {
    throw new Error("此車型尚未接入 RAG 語料庫，請點「目標車型支援清單」查看可用車款");
  }

  const personaId = String(body.personaId ?? "P-01").trim();
  if (!ROLEPLAY_GLOBAL_CONFIG.personas.some((p) => p.id === personaId)) {
    throw new Error("無效的客戶類型");
  }

  const ageRange = String(body.ageRange ?? "30-40").trim() as RoleplayAgeRange;
  if (!ROLEPLAY_AGE_RANGES.some((a) => a.id === ageRange)) {
    throw new Error("無效的年齡範圍");
  }

  const competitor = String(body.competitor ?? ROLEPLAY_COMPETITORS_XTRAIL[0]).trim();
  const difficulty = String(body.difficulty ?? "advanced").trim() as RoleplayDrillDifficulty;
  if (!ROLEPLAY_DIFFICULTIES.some((d) => d.id === difficulty)) {
    throw new Error("無效的難度");
  }

  return {
    productLine,
    personaId,
    ageRange,
    competitor,
    maxTurns: clampTurns(Number(body.maxTurns ?? 5)),
    difficulty,
  };
}

function buildSectionF(): RoleplayScenario["sectionF"] {
  const dims = ROLEPLAY_GLOBAL_CONFIG.rubricDimensions;
  return {
    criteria: dims.map((d) => ({
      dimensionId: d.id,
      highExample: `符合${d.label}標準，有具體例證`,
      lowExample: `${d.label}不足或遺漏關鍵步驟`,
    })),
  };
}

export async function composeScenarioFromConfig(
  config: RoleplaySessionConfig,
): Promise<RoleplayScenario> {
  const product = getProductLine(config.productLine);
  const displayName = product?.displayName ?? "X-TRAIL ICE";
  const rag = await fetchRoleplayRagContext(config);
  const persona =
    ROLEPLAY_GLOBAL_CONFIG.personas.find((p) => p.id === config.personaId) ??
    ROLEPLAY_GLOBAL_CONFIG.personas[0]!;

  const brief = await generateRoleplayOpeningBrief({
    config,
    productDisplayName: displayName,
    persona,
    rag,
  });

  const scenarioId = `dyn-${randomUUID().slice(0, 8)}`;

  return {
    scenarioId,
    sectionA: {
      title: `${displayName} vs ${config.competitor} · ${persona.name}`,
      productLine: config.productLine,
      productDisplayName: displayName,
      competitor: config.competitor,
      coreIssue: brief.coreIssue,
    },
    sectionB: {
      openingLine: brief.openingLine,
      followUps: brief.followUps,
    },
    sectionC: { facts: rag.facts },
    sectionD: {
      keyPoints: rag.keyPoints,
      forbidden: rag.forbidden,
      closingActions: rag.closingActions,
    },
    sectionE: {
      difficulty: config.difficulty,
      maxTurns: config.maxTurns,
      personaId: config.personaId,
      ageRange: config.ageRange,
    },
    sectionF: buildSectionF(),
  };
}
