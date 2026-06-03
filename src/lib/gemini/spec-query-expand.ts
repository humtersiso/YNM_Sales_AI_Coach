/** 規格／數字類問句：擴展 BQ 檢索關鍵字 */
const SYNONYMS: { pattern: RegExp; terms: string[] }[] = [
  { pattern: /馬力|幾匹|horsepower/i, terms: ["最大馬力", "馬力", "功率", "ps", "VC-TURBO"] },
  { pattern: /扭力/i, terms: ["最大扭力", "扭力", "kgm", "公斤米"] },
  { pattern: /油耗|省油|km\/l/i, terms: ["油耗", "km/L", "平均油耗", "公里"] },
  { pattern: /軸距|車長|車寬|尺寸/i, terms: ["軸距", "車長", "尺碼", "規格"] },
  { pattern: /規格|配備/i, terms: ["規格", "配備", "改款"] },
];

export function isSpecNumericQuery(message: string): boolean {
  return /馬力|扭力|功率|油耗|幾公升|km\/l|軸距|車長|車寬|尺寸|規格|配備有|多少|幾匹|ps\b/i.test(
    message,
  );
}

/** 過短規格追問（如「馬力如何」）補上本品主體，避免向量搜尋命中競品庫 */
export function augmentSpecQueryForSearch(
  message: string,
  heroDisplayName = "X-TRAIL ICE",
): string {
  const t = message.trim();
  if (!isSpecNumericQuery(t)) return message;
  if (/x-?trail|xtrail|勁客|\bkicks\b/i.test(t)) return message;

  const hasCompetitor = /tucson|途勝|sportage|rav4|cr-?v|x-?\s*force|xforce|territory|mufasa|kuga/i.test(
    t,
  );
  if (hasCompetitor && !/x-?trail|xtrail/i.test(t)) {
    return `${t} 規格`;
  }

  if (t.length > 20) return message;
  return `${heroDisplayName} ${t} 規格`.trim();
}

export function expandSpecSearchTerms(message: string, baseTerms: string[]): string[] {
  const out = new Set<string>(baseTerms);
  for (const { pattern, terms } of SYNONYMS) {
    if (pattern.test(message)) {
      for (const t of terms) out.add(t);
    }
  }
  if (isSpecNumericQuery(message)) {
    out.add("改款");
    out.add("對戰");
  }
  return [...out].slice(0, 16);
}
