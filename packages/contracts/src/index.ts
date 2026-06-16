/** 廠商 API 共用使用者身分（對齊 SessionUser） */
export type ApiUser = {
  userId: string;
  username: string;
  displayName: string;
  branch: string;
  role: "admin" | "agent";
};

export type SalesChatRequestBody = {
  message: string;
  productLine?: string;
  materialCategory?: string;
};

export type RoleplayStartBody = {
  scenarioId?: string;
  personaId?: string;
  mode?: "custom" | "random" | "demo";
  config?: Record<string, unknown>;
};

export type RoleplayTurnBody = {
  message: string;
};
