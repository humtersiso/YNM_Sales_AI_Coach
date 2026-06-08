import type {
  RoleplayCorrectionCategory,
  RoleplayCorrectionPoint,
} from "@/lib/roleplay/session-types";

/** 純顯示／正規化用，不含 Gemini，可給 client component 使用 */
export function inferCorrectionCategory(issue: string): RoleplayCorrectionCategory {
  if (/收尾|邀約|試乘|試算|策略|下一步/.test(issue)) return "strategy";
  return "fact";
}

export function normalizeCorrectionPoint(
  p: Partial<RoleplayCorrectionPoint> & { issue: string; correctGuide: string },
): RoleplayCorrectionPoint {
  return {
    issue: p.issue,
    category: p.category ?? inferCorrectionCategory(p.issue),
    customerAsk: p.customerAsk,
    whatYouSaid: p.whatYouSaid,
    correctGuide: p.correctGuide,
  };
}
