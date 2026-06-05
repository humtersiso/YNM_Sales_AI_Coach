export type RoleplayGrade = "S" | "A" | "B" | "C" | "D";

/** 對練難度（UI：新手／進階／挑戰） */
export type RoleplayDrillDifficulty = "beginner" | "advanced" | "challenge";

/** 相容舊示範情境 */
export type RoleplayLegacyDifficulty = "easy" | "normal" | "hard";

export type RoleplayDifficulty = RoleplayDrillDifficulty | RoleplayLegacyDifficulty;

export type RoleplayAgeRange = "20-30" | "30-40" | "40-50" | "50+";

export type RoleplaySessionConfig = {
  productLine: string;
  personaId: string;
  ageRange: RoleplayAgeRange;
  competitor: string;
  maxTurns: number;
  difficulty: RoleplayDrillDifficulty;
};

export type RoleplayScenarioSectionA = {
  title: string;
  productLine: string;
  productDisplayName: string;
  competitor: string;
  coreIssue: string;
};

export type RoleplayScenarioSectionB = {
  openingLine: string;
  followUps: string[];
};

export type RoleplayScenarioSectionC = {
  facts: { label: string; value: string }[];
};

export type RoleplayScenarioSectionD = {
  keyPoints: string[];
  forbidden: string[];
  closingActions: string[];
};

export type RoleplayScenarioSectionE = {
  difficulty: RoleplayDifficulty;
  maxTurns: number;
  personaId: string;
  ageRange?: RoleplayAgeRange;
};

export type RoleplayScenarioSectionF = {
  criteria: {
    dimensionId: string;
    highExample: string;
    lowExample: string;
  }[];
};

export type RoleplayScenario = {
  scenarioId: string;
  sectionA: RoleplayScenarioSectionA;
  sectionB: RoleplayScenarioSectionB;
  sectionC: RoleplayScenarioSectionC;
  sectionD: RoleplayScenarioSectionD;
  sectionE: RoleplayScenarioSectionE;
  sectionF: RoleplayScenarioSectionF;
};

export type RoleplayPersona = {
  id: string;
  name: string;
  style: string;
  traits: string[];
  decisionMode: string;
};

export type RoleplayRubricDimension = {
  id: string;
  label: string;
  weight: number;
};

export type RoleplayGradeBand = {
  grade: RoleplayGrade;
  min: number;
  max: number;
  label: string;
  advice: string;
};

export type RoleplayGlobalConfig = {
  personas: RoleplayPersona[];
  rubricDimensions: RoleplayRubricDimension[];
  gradeBands: RoleplayGradeBand[];
};

/** 素材區／列表用（不含 F 評分細節） */
export type RoleplayScenarioPublicView = {
  scenarioId: string;
  title: string;
  productDisplayName: string;
  competitor: string;
  coreIssue: string;
  difficulty: RoleplayDifficulty;
  maxTurns: number;
  personaId: string;
  openingLine: string;
  factCount: number;
  keyPointCount: number;
};

export type RoleplayScenarioDetailView = RoleplayScenarioPublicView & {
  sectionB: Omit<RoleplayScenarioSectionB, "followUps"> & { followUpCount: number };
  sectionC: RoleplayScenarioSectionC;
  sectionD: Omit<RoleplayScenarioSectionD, "forbidden"> & { forbiddenCount: number };
  sectionE: RoleplayScenarioSectionE;
};
