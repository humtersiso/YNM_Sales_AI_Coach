/**
 * 高分問答集 · 議題分類與情境矩陣（對齊對練 opening-generator / correction-builder）
 */
import type { RagFact } from "./roleplay-high-score-qa-rag-text";

export type QaTopic =
  | "fuel"
  | "maintenance"
  | "sound"
  | "blind"
  | "space"
  | "price"
  | "safety"
  | "equip"
  | "strategy"
  | "advance"
  | "general";

export const QA_TOPIC_LABELS: Record<QaTopic, string> = {
  fuel: "油耗／持有成本",
  maintenance: "保養／耐用",
  sound: "隔音／質感",
  blind: "盲操／操作",
  space: "空間／舒適",
  price: "價格／方案",
  safety: "安全／輔助",
  equip: "配備／科技",
  strategy: "銷售策略",
  advance: "推進成交",
  general: "綜合比較",
};

const TOPIC_RULES: { topic: QaTopic; re: RegExp }[] = [
  { topic: "fuel", re: /油耗|km\/L|WLTC|油費|油資|省油|持有成本|試算|年里程/i },
  { topic: "maintenance", re: /保養|定保|回廠|維修|引擎|積碳|CVT|耐用|故障|亮燈|妥善/i },
  { topic: "sound", re: /隔音|玻璃|分貝|NVH|靜音|噪音/i },
  { topic: "blind", re: /旋鈕|按鍵|盲|螢幕|操作|觸控|整合/i },
  { topic: "space", re: /空間|後座|行李|座椅|七人|乘坐/i },
  { topic: "price", re: /價格|優惠|促銷|方案|月供|折扣|車價|萬元/i },
  { topic: "safety", re: /ProPILOT|輔助|安全|AEB|防撞|ADAS/i },
  { topic: "equip", re: /配備|科技|舒適|質感|功能/i },
];

export function classifySnippetTopic(text: string): QaTopic {
  for (const { topic, re } of TOPIC_RULES) {
    if (re.test(text)) return topic;
  }
  return "general";
}

export function bucketSnippetsByTopic(snippets: string[]): Record<QaTopic, string[]> {
  const buckets = Object.fromEntries(
    (Object.keys(QA_TOPIC_LABELS) as QaTopic[]).map((k) => [k, [] as string[]]),
  ) as Record<QaTopic, string[]>;
  for (const s of snippets) {
    buckets[classifySnippetTopic(s)].push(s);
  }
  return buckets;
}

/** 依議題取 RAG 句，不足時 fallback 全池 */
export function pickSnippetForTopic(
  buckets: Record<QaTopic, string[]>,
  pool: string[],
  topic: QaTopic,
  index: number,
): string {
  const chain: QaTopic[] = [topic, "general", "fuel", "equip", "maintenance"];
  for (const t of chain) {
    const b = buckets[t];
    if (b.length > 0) return b[index % b.length]!;
  }
  return pool[index % pool.length] ?? "（請對照本場 RAG 教材補充）";
}

export function collectThemesFromFacts(facts: RagFact[]): string[] {
  const themes: string[] = [];
  for (const f of facts) {
    const text = `${f.label} ${f.value}`;
    for (const { topic, re } of TOPIC_RULES) {
      if (re.test(text)) {
        const label = QA_TOPIC_LABELS[topic];
        if (!themes.includes(label)) themes.push(label);
      }
    }
  }
  return themes.slice(0, 8);
}

export function inferPrimaryIssue(
  opening: string | undefined,
  snippets: string[],
  competitorShort: string,
): string {
  const text = `${opening ?? ""} ${snippets.slice(0, 8).join(" ")}`;
  const c = competitorShort;
  const checks: { re: RegExp; label: string }[] = [
    { re: /積碳|亮燈|引擎|耐用|故障|維修/i, label: `引擎／耐用（vs ${c}）` },
    { re: /隔音|玻璃|分貝|NVH/i, label: `隔音／質感（vs ${c}）` },
    { re: /旋鈕|盲|操作|螢幕/i, label: `操作／盲操（vs ${c}）` },
    { re: /空間|後座|行李/i, label: `空間／舒適（vs ${c}）` },
    { re: /促銷|優惠|價格|月供|划算/i, label: `價格／方案（vs ${c}）` },
    { re: /ProPILOT|輔助|安全|AEB/i, label: `安全／輔助（vs ${c}）` },
    { re: /定位|油電|產品/i, label: `產品定位（vs ${c}）` },
    { re: /油耗|km\/L|WLTC|油費|持有成本/i, label: `油耗／持有成本（vs ${c}）` },
  ];
  for (const { re, label } of checks) {
    if (re.test(text)) return label;
  }
  return `產品比較（vs ${c}）`;
}

/** 各競品章節 · 20 題對應議題（固定骨架，內容來自 RAG） */
export const QA_SLOT_TOPIC_MAP: { slot: number; topic: QaTopic; tag: string }[] = [
  { slot: 1, topic: "general", tag: "R1 開場" },
  { slot: 2, topic: "fuel", tag: "油耗／WLTC" },
  { slot: 3, topic: "maintenance", tag: "保養／回廠" },
  { slot: 4, topic: "sound", tag: "隔音／玻璃" },
  { slot: 5, topic: "blind", tag: "盲操／操作" },
  { slot: 6, topic: "space", tag: "空間／舒適" },
  { slot: 7, topic: "price", tag: "價格／方案" },
  { slot: 8, topic: "safety", tag: "安全／輔助" },
  { slot: 9, topic: "fuel", tag: "P-01 理性" },
  { slot: 10, topic: "price", tag: "P-03 預算" },
  { slot: 11, topic: "maintenance", tag: "P-05 研究" },
  { slot: 12, topic: "space", tag: "30–40 歲" },
  { slot: 13, topic: "safety", tag: "50+ 歲" },
  { slot: 14, topic: "strategy", tag: "策略-LINE延後" },
  { slot: 15, topic: "strategy", tag: "策略-試乘延後" },
  { slot: 16, topic: "equip", tag: "配備／科技" },
  { slot: 17, topic: "equip", tag: "RAG 事實 1" },
  { slot: 18, topic: "maintenance", tag: "RAG 事實 2" },
  { slot: 19, topic: "general", tag: "地雷-競品錨定" },
  { slot: 20, topic: "advance", tag: "成交收尾" },
];

/** 對練設定頁可組合的維度（高分問答集依「競品章節」產出，非全排列） */
export const ROLEPLAY_SCENARIO_DIMENSIONS = {
  products: [
    { id: "xtrail-ice", name: "X-TRAIL ICE", qaChapters: ["rav4", "crv", "tucson", "outlander", "sportage"] },
    { id: "kicks", name: "KICKS", qaChapters: ["kicks-hrv"] },
  ],
  personas: [
    { id: "P-01", name: "理性分析型", qaSlots: [9] },
    { id: "P-02", name: "情感品牌型", qaSlots: [] },
    { id: "P-03", name: "預算敏感型", qaSlots: [10] },
    { id: "P-04", name: "猶豫從眾型", qaSlots: [6, 20] },
    { id: "P-05", name: "深度研究型", qaSlots: [11] },
  ],
  ageRanges: [
    { id: "20-30", name: "20–30 歲" },
    { id: "30-40", name: "30–40 歲", qaSlots: [12] },
    { id: "40-50", name: "40–50 歲" },
    { id: "50+", name: "50 歲以上", qaSlots: [13] },
  ],
  difficulties: [
    { id: "beginner", name: "新手" },
    { id: "advanced", name: "進階" },
    { id: "challenge", name: "挑戰", qaSlots: [5, 16] },
  ],
  rounds: { default: 5, min: 3, max: 10 },
  topicCoveragePerChapter: QA_SLOT_TOPIC_MAP.map((s) => ({
    slot: s.slot,
    topic: QA_TOPIC_LABELS[s.topic],
    tag: s.tag,
  })),
} as const;

export const COMPETITOR_CHAPTER_PROFILE: Record<
  string,
  { competitors: string; primaryTopics: string[]; openingHint: string }
> = {
  rav4: {
    competitors: "Toyota RAV4",
    primaryTopics: ["油耗／持有成本", "WLTC 試算", "安全輔助", "總價差異"],
    openingHint: "RAV4 油耗口碑 vs X-TRAIL 長期成本",
  },
  crv: {
    competitors: "Honda CR-V",
    primaryTopics: ["油耗數據", "輕油電比較", "空間", "保養"],
    openingHint: "CR-V 與 X-TRAIL 油耗討論、實際數據",
  },
  tucson: {
    competitors: "Hyundai Tucson L",
    primaryTopics: ["油電定位", "產品差異", "配備", "價格"],
    openingHint: "Tucson L 油電 vs X-TRAIL 怎麼定位",
  },
  outlander: {
    competitors: "Mitsubishi Outlander",
    primaryTopics: ["通勤油耗", "實際路況", "空間", "持有成本"],
    openingHint: "規格表油耗 vs 實際通勤油錢",
  },
  sportage: {
    competitors: "KIA Sportage",
    primaryTopics: ["引擎耐用", "積碳／亮燈", "保養", "外型 vs 實用"],
    openingHint: "Sportage 引擎與 Tucson 同款、積碳疑慮",
  },
  "kicks-hrv": {
    competitors: "Honda HR-V",
    primaryTopics: ["促銷方案", "總價", "都會用車", "油耗"],
    openingHint: "HR-V 促銷 vs KICKS 划算程度",
  },
};
