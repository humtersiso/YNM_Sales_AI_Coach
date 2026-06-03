import { clusterQuestions } from "@/lib/analytics/question-dedup";
import type { QueryLog } from "@/lib/analytics/types";

export type QuestionCategoryId =
  | "fuel"
  | "space"
  | "lv2"
  | "safety"
  | "price"
  | "compare"
  | "other";

const CATEGORIES: { id: QuestionCategoryId; label: string; keywords: string[] }[] = [
  { id: "fuel", label: "油耗相關", keywords: ["油耗", "省油", "km", "公升"] },
  { id: "space", label: "空間大小", keywords: ["空間", "後座", "行李", "膝部", "乘坐"] },
  { id: "lv2", label: "LV2／智行", keywords: ["lv2", "lv 2", "輔助", "智行", "主動安全", "adas"] },
  { id: "safety", label: "安全配備", keywords: ["安全", "配備", "氣囊", "防撞"] },
  { id: "price", label: "價格促銷", keywords: ["價格", "促銷", "優惠", "太貴", "分期", "零利率"] },
  { id: "compare", label: "車款比較", keywords: ["怎麼比", "怎麼選", "差異", "比較", "之間猶豫"] },
];

export function classifyCompetitorQuestion(question: string): QuestionCategoryId {
  const n = question.toLowerCase().replace(/\s+/g, "");
  for (const cat of CATEGORIES) {
    if (cat.keywords.some((kw) => n.includes(kw.replace(/\s+/g, "")))) {
      return cat.id;
    }
  }
  return "other";
}

export function getCategoryLabel(id: QuestionCategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "其他";
}

export type QuestionCategoryStat = {
  categoryId: QuestionCategoryId;
  label: string;
  count: number;
  sharePct: number;
};

export type GroupedCompetitorTopic = {
  id: string;
  categoryId: QuestionCategoryId;
  categoryLabel: string;
  representativeQuestion: string;
  variantQuestions: string[];
  count: number;
  sharePct: number;
  lastAskedAt: string;
  tags: string[];
};

export function computeCategoryBreakdown(logs: QueryLog[]): QuestionCategoryStat[] {
  const competitor = logs.filter((l) => l.isCompetitor);
  const total = competitor.length || 1;
  const counts = new Map<QuestionCategoryId, number>();

  for (const row of competitor) {
    const cat = classifyCompetitorQuestion(row.question);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  return CATEGORIES.map((cat) => {
    const count = counts.get(cat.id) ?? 0;
    return {
      categoryId: cat.id,
      label: cat.label,
      count,
      sharePct: count > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    };
  })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** 依題庫群組或語意分類整合相近競品問題 */
export function computeGroupedCompetitorTopics(
  logs: QueryLog[],
  similarityPct = 85,
): GroupedCompetitorTopic[] {
  const competitor = logs.filter((l) => l.isCompetitor);
  const total = competitor.length || 1;
  const threshold = similarityPct / 100;

  type Bucket = {
    categoryId: QuestionCategoryId;
    questions: string[];
    count: number;
    last: string;
    tags: Set<string>;
  };

  const byCluster = new Map<string, Bucket>();

  for (const row of competitor) {
    const cat = classifyCompetitorQuestion(row.question);
    const key = row.dedupCluster ?? `cat:${cat}`;

    const bucket = byCluster.get(key) ?? {
      categoryId: cat,
      questions: [],
      count: 0,
      last: row.askedAt,
      tags: new Set<string>(),
    };
    bucket.count += 1;
    if (!bucket.questions.includes(row.question)) {
      bucket.questions.push(row.question);
    }
    if (row.askedAt > bucket.last) bucket.last = row.askedAt;
    row.competitorTags?.forEach((t) => bucket.tags.add(t));
    byCluster.set(key, bucket);
  }

  const merged: Bucket[] = [];

  for (const bucket of byCluster.values()) {
    const clusters = clusterQuestions(bucket.questions, threshold);
    for (const cluster of clusters) {
      const rep = cluster.representative;
      const cat = classifyCompetitorQuestion(rep);
      const countInCluster = competitor.filter((r) =>
        cluster.members.includes(r.question.trim()),
      ).length;
      merged.push({
        categoryId: cat,
        questions: cluster.members,
        count: countInCluster > 0 ? countInCluster : cluster.members.length,
        last: bucket.last,
        tags: bucket.tags,
      });
    }
  }

  return merged
    .map((b, i) => ({
      id: `topic_${i + 1}`,
      categoryId: b.categoryId,
      categoryLabel: getCategoryLabel(b.categoryId),
      representativeQuestion: b.questions[0] ?? "",
      variantQuestions: b.questions,
      count: b.count,
      sharePct: Math.round((b.count / total) * 1000) / 10,
      lastAskedAt: b.last,
      tags: [...b.tags],
    }))
    .sort((a, b) => b.count - a.count);
}
