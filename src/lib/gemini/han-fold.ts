/** 簡繁／全形正規化，供關鍵詞比對 */
export function hanFold(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/异/g, "異")
    .replace(/试/g, "試")
    .replace(/觉/g, "覺")
    .replace(/听/g, "聽")
    .replace(/声/g, "聲")
    .replace(/发/g, "發")
    .replace(/来/g, "來")
    .replace(/为/g, "為")
    .replace(/这/g, "這")
    .replace(/么/g, "麼")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function blobContainsTerm(blob: string, term: string): boolean {
  const b = hanFold(blob);
  const t = hanFold(term);
  if (!t || t.length < 2) return false;
  return b.includes(t);
}
