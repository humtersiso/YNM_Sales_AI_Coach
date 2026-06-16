/** 持有成本／用車成本／要詳細數字 */
export function isCostDetailQuery(message: string): boolean {
  return /持有成本|用車成本|長期成本|保養成本|保養|油耗|試算|詳細數字|多少錢|幾萬|費用|定保|牌照稅|燃料稅|電池.*費|輪胎/i.test(
    message,
  );
}

function pushCompetitorCostHints(message: string, parts: string[]): void {
  const t = message.trim();
  if (/cr-?v/i.test(t)) parts.push("CR-V", "Honda");
  if (/rav4/i.test(t)) parts.push("RAV4");
  if (/tucson|途勝/i.test(t)) parts.push("TUCSON L");
  if (/territory|福特/i.test(t)) parts.push("Territory");
  if (/sportage/i.test(t)) parts.push("Sportage");
}

export function augmentCostQueryForSearch(message: string): string {
  const t = message.trim();
  if (!isCostDetailQuery(t)) return message;
  const parts = [t, "長期持有成本", "用車成本", "8萬公里", "16萬公里", "合計", "差異"];
  pushCompetitorCostHints(t, parts);
  if (!/x-?trail|xtrail/i.test(t)) parts.push("X-TRAIL");
  return [...new Set(parts)].join(" ");
}

export function expandCostSearchTerms(message: string, baseTerms: string[]): string[] {
  const out = new Set<string>(baseTerms);
  if (!isCostDetailQuery(message)) return [...out];
  for (const t of [
    "持有成本",
    "用車成本",
    "長期持有",
    "8萬",
    "16萬",
    "合計",
    "油耗成本",
    "電池",
    "定保",
    "差異",
  ]) {
    out.add(t);
  }
  if (/cr-?v/i.test(message)) out.add("CR-V");
  if (/rav4/i.test(message)) out.add("RAV4");
  if (/tucson|途勝/i.test(message)) out.add("TUCSON L");
  return [...out].slice(0, 18);
}
