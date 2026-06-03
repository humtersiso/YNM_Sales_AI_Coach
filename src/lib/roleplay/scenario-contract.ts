export type RoleplayGrade = "S" | "A" | "B" | "C" | "D";

export type RoleplayDifficulty = "easy" | "normal" | "hard";

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
