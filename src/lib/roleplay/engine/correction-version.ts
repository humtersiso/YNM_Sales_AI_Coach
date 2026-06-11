/** 待加強 Rubric 邏輯版本；升級後舊場次可在詳情頁觸發一次性重算 */
export const CORRECTION_RUBRIC_VERSION = "rubric-v2";

export function needsCorrectionRebuild(
  savedVersion: string | null | undefined,
  hasPoints: boolean,
): boolean {
  if (hasPoints && savedVersion === CORRECTION_RUBRIC_VERSION) return false;
  if (hasPoints && savedVersion == null) return false;
  if (!hasPoints) return true;
  return savedVersion !== CORRECTION_RUBRIC_VERSION;
}
