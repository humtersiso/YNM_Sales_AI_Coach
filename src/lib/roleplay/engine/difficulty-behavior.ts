import type { RoleplayDrillDifficulty, RoleplayDifficulty } from "@/lib/roleplay/scenario-contract";

export function normalizeDrillDifficulty(
  d: RoleplayDifficulty,
): RoleplayDrillDifficulty {
  if (d === "beginner" || d === "easy") return "beginner";
  if (d === "challenge" || d === "hard") return "challenge";
  return "advanced";
}

export function difficultyBehaviorPrompt(d: RoleplayDrillDifficulty): string {
  switch (d) {
    case "beginner":
      return "難度：新手。追問 1～2 個疑慮後若業代回應合理，可逐漸接受，語氣可緩和，勿連續追殺。";
    case "advanced":
      return "難度：進階。即使被說服一部分，仍要提出新的疑慮或比較點，維持購買猶豫。";
    case "challenge":
      return "難度：挑戰。強硬立場，要求具體數字與測試條件，不輕易妥協，可質疑業代說法。";
    default:
      return "難度：進階。";
  }
}

export function ageRangePrompt(age: string): string {
  const map: Record<string, string> = {
    "20-30": "客戶約 20～30 歲，語氣較直接，可能重視科技與外觀。",
    "30-40": "客戶約 30～40 歲，常兼顧家庭與通勤，重視空間與安全。",
    "40-50": "客戶約 40～50 歲，重視可靠度與養車成本。",
    "50+": "客戶 50 歲以上，決策謹慎，重視舒適與售後。",
  };
  return map[age] ?? "客戶為一般購車年齡層。";
}
