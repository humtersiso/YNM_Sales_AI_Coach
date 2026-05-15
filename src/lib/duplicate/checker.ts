import stringSimilarity from "string-similarity";

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？!?,.;；:"'「」『』（）()]/g, "");
}

export function findBestDuplicate(
  target: string,
  candidates: Array<{ id: string; originalText: string; suggestedReply: string }>,
  threshold = 0.72,
) {
  if (!target.trim() || candidates.length === 0) {
    return null;
  }

  const normalizedTarget = normalizeText(target);
  let best:
    | {
        id: string;
        score: number;
        suggestedReply: string;
      }
    | null = null;

  for (const item of candidates) {
    const score = stringSimilarity.compareTwoStrings(
      normalizedTarget,
      normalizeText(item.originalText),
    );

    if (!best || score > best.score) {
      best = {
        id: item.id,
        score,
        suggestedReply: item.suggestedReply,
      };
    }
  }

  if (!best || best.score < threshold) {
    return null;
  }

  return best;
}
