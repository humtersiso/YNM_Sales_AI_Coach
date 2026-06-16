import type {
  RoleplayAgeRange,
  RoleplayDrillDifficulty,
  RoleplaySessionConfig,
} from "@/lib/roleplay/scenario-contract";

/** 由 BQ target_model 推斷 productLine（表內無 product_line 欄） */
export function inferRoleplayProductLine(targetModel: string): string {
  if (/kicks|勁客/i.test(targetModel)) return "kicks";
  return "xtrail-ice";
}

export function roleplaySessionConfigFromParts(parts: {
  productLine?: string;
  targetModel?: string;
  personaId: string;
  ageRange: string;
  competitor: string;
  difficulty: string;
  maxTurns?: number;
}): RoleplaySessionConfig {
  return {
    productLine:
      parts.productLine?.trim() ||
      inferRoleplayProductLine(parts.targetModel ?? ""),
    personaId: parts.personaId,
    ageRange: parts.ageRange as RoleplayAgeRange,
    competitor: parts.competitor,
    difficulty: parts.difficulty as RoleplayDrillDifficulty,
    maxTurns: parts.maxTurns ?? 5,
  };
}
