import type { RoleplayGrade } from "@/lib/roleplay/scenario-contract";
import { ROLEPLAY_GLOBAL_CONFIG } from "@/lib/roleplay/seed/global-config";

export function clampScore(score: number): number {
  return Math.min(100, Math.max(0, Math.round(score)));
}

export function scoreToGrade(score: number): {
  grade: RoleplayGrade;
  gradeLabel: string;
  advice: string;
} {
  const s = clampScore(score);
  const band =
    ROLEPLAY_GLOBAL_CONFIG.gradeBands.find((b) => s >= b.min && s <= b.max) ??
    ROLEPLAY_GLOBAL_CONFIG.gradeBands[ROLEPLAY_GLOBAL_CONFIG.gradeBands.length - 1];
  return { grade: band.grade, gradeLabel: band.label, advice: band.advice };
}
