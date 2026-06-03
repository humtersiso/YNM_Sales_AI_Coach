function normalizeQuestion(text: string): string {
  return text
    .replace(/[\s?？！!，,。.、；;：:""''「」【】()（）\[\]]/g, "")
    .toLowerCase();
}

/** 以字元雙連字（bigram）Dice 係數估算中文問題相似度，PoC 不需 embedding API */
function bigrams(text: string): Set<string> {
  const n = normalizeQuestion(text);
  const set = new Set<string>();
  if (n.length === 0) return set;
  if (n.length === 1) {
    set.add(n);
    return set;
  }
  for (let i = 0; i < n.length - 1; i++) set.add(n.slice(i, i + 2));
  return set;
}

export function questionSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  return (2 * inter) / (A.size + B.size);
}

export type QuestionCluster = {
  representative: string;
  members: string[];
};

/** 貪婪合併：與群代表相似度 ≥ threshold 則視為同一題 */
export function clusterQuestions(questions: string[], threshold: number): QuestionCluster[] {
  const clusters: QuestionCluster[] = [];

  for (const q of questions) {
    const trimmed = q.trim();
    if (!trimmed) continue;

    let placed = false;
    for (const cluster of clusters) {
      if (questionSimilarity(trimmed, cluster.representative) >= threshold) {
        cluster.members.push(trimmed);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push({ representative: trimmed, members: [trimmed] });
    }
  }

  return clusters;
}

export type DedupItem = {
  question: string;
  dedupCluster?: string;
  dedupPairId?: string;
};

/**
 * 門檻愈高愈嚴格（僅合併幾乎相同問法）→ 重複題數愈少；
 * 門檻愈低愈寬鬆（整組主題視為同一題）→ 重複題數愈多。
 */
function uniqueKeyForItem(item: DedupItem, threshold: number): string {
  if (item.dedupCluster) {
    if (threshold >= 0.94) {
      if (item.dedupPairId) return `${item.dedupCluster}::${item.dedupPairId}`;
      return `${item.dedupCluster}::${item.question.trim()}`;
    }
    return item.dedupCluster;
  }
  return item.question.trim();
}

export function computeDedupStats(items: DedupItem[], thresholdPct: number) {
  const threshold = thresholdPct / 100;
  const valid = items.filter((i) => i.question.trim());
  const rawCount = valid.length;
  if (rawCount === 0) {
    return {
      rawCount: 0,
      uniqueCount: 0,
      duplicateCount: 0,
      duplicatePct: 0,
      clusters: [] as QuestionCluster[],
    };
  }

  const hasClusterMeta = valid.every((i) => i.dedupCluster);

  if (hasClusterMeta) {
    const keys = new Set(valid.map((i) => uniqueKeyForItem(i, threshold)));
    const uniqueCount = keys.size;
    const duplicateCount = rawCount - uniqueCount;
    const duplicatePct = Math.round((duplicateCount / rawCount) * 1000) / 10;
    return {
      rawCount,
      uniqueCount,
      duplicateCount,
      duplicatePct,
      clusters: clusterQuestions(
        valid.map((i) => i.question),
        threshold,
      ),
    };
  }

  const clusters = clusterQuestions(
    valid.map((i) => i.question),
    threshold,
  );
  const uniqueCount = clusters.length;
  const duplicateCount = rawCount - uniqueCount;
  const duplicatePct = Math.round((duplicateCount / rawCount) * 1000) / 10;

  return { rawCount, uniqueCount, duplicateCount, duplicatePct, clusters };
}
