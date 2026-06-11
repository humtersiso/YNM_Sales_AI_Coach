/**
 * 競品高分對答指南 · 每競品 20 題（內容皆來自 RAG 佐證句 · 多議題分桶）
 */
import { ROLEPLAY_COMPETITORS_XTRAIL } from "../../../src/lib/roleplay/catalog";
import { normalizeCompetitorToken } from "../../../src/lib/roleplay/engine/correction-guide";
import { inferCustomerHook } from "./roleplay-high-score-qa-rag-text";
import {
  bucketSnippetsByTopic,
  collectThemesFromFacts,
  COMPETITOR_CHAPTER_PROFILE,
  inferPrimaryIssue,
  pickSnippetForTopic,
  QA_SLOT_TOPIC_MAP,
  QA_TOPIC_LABELS,
  ROLEPLAY_SCENARIO_DIMENSIONS,
  type QaTopic,
} from "./roleplay-high-score-qa-topics";

export type QA = {
  id: string;
  slot: number;
  tags: string[];
  q: string;
  blank: string;
  full: string;
  score?: string;
  ragSources?: string[];
  topic?: string;
};

export type CompetitorChapter = {
  slug: string;
  competitor: string;
  short: string;
  productLine: "xtrail" | "kicks";
  product: string;
  issue: string;
  themes: string[];
  hook: string;
  ragSources: string[];
  questions: QA[];
};

export type RagChapterInput = {
  slug: string;
  competitor: string;
  short: string;
  product: string;
  productLine: "xtrail" | "kicks";
  facts: { label: string; value: string }[];
  snippets: string[];
  keyPoints: string[];
  closingActions: string[];
  sources: string[];
  opening?: string;
  ragExportedAt?: string;
};

export function B(answer: string): string {
  const safe = String(answer).replace(/"/g, "&quot;");
  return `<span class="blank" data-answer="${safe}">＿＿＿</span>`;
}

const PERSONAS = {
  "P-01": { name: "理性分析型", focus: "數據、WLTC、試算公式" },
  "P-03": { name: "預算敏感型", focus: "總價、月供、促銷" },
  "P-05": { name: "深度研究型", focus: "論壇質疑、耐用與來源" },
} as const;

const AGES = [
  { id: "30-40", label: "30–40 歲", tone: "家庭用車、比較理性" },
  { id: "50+", label: "50 歲以上", tone: "重視可靠與好上手" },
] as const;

function mkId(prefix: string, slot: number): string {
  return `${prefix}-${String(slot).padStart(2, "0")}`;
}

function pickWrongCompetitor(current: string): string {
  const others = ROLEPLAY_COMPETITORS_XTRAIL.filter((c) => c !== current);
  return normalizeCompetitorToken(others[0] ?? "其他車款");
}

type Ctx = RagChapterInput & {
  buckets: ReturnType<typeof bucketSnippetsByTopic>;
  issue: string;
  hook: string;
  close: string;
  close2: string;
  src: string[];
  prefix: string;
};

function sq(ctx: Ctx, topic: QaTopic, i: number): string {
  return pickSnippetForTopic(ctx.buckets, ctx.snippets, topic, i);
}

function Bq(ctx: Ctx, topic: QaTopic, i: number): string {
  return B(sq(ctx, topic, i).slice(0, 72));
}

function buildQuestion(ctx: Ctx, slot: number, topic: QaTopic, tag: string): Omit<QA, "id"> {
  const P = ctx.product;
  const C = ctx.short;
  const cFull = ctx.competitor;
  const si = slot;

  const templates: Record<number, () => Omit<QA, "id" | "slot">> = {
    1: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.general,
      q: `「我最近在比 ${P} 跟 ${C}，${ctx.hook.replace(/[。！？]+$/g, "")}。你們值得考慮嗎？」`,
      blank: `理解您會比較${B(ctx.issue.split("（")[0]!)}，這很合理。<br/>依本場教材：${Bq(ctx, topic, 0)}<br/>另可補充：${Bq(ctx, "equip", 1)}<br/>${B(ctx.close)}？`,
      full: `理解您會比較${ctx.issue.split("（")[0]}，這很合理。<br/>依本場教材：${sq(ctx, topic, 0)}<br/>另可補充：${sq(ctx, "equip", 1)}<br/>${ctx.close}？`,
      score: "同理+事實",
      ragSources: ctx.src,
    }),
    2: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.fuel,
      q: `「${C} 官網油耗我都看過了，你們教材怎麼說？WLTC 跟實際差很多吧？」`,
      blank: `教材依據：${Bq(ctx, "fuel", 2)}<br/>${B("同一測試基準")}橫向比較。<br/>用您的年里程 ${B("當場試算")}＋${B("試乘驗證")}。`,
      full: `教材依據：${sq(ctx, "fuel", 2)}<br/>同一測試基準橫向比較。<br/>用您的年里程當場試算＋試乘驗證。`,
      score: "factCheck",
      ragSources: ctx.src,
    }),
    3: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.maintenance,
      q: `「${C} 聽說保養便宜，${P} 回廠費用跟耐用度教材怎麼說？」`,
      blank: `先承接保養是長期成本：${Bq(ctx, "maintenance", 3)}<br/>${B("回廠頻率與定保")}對照說明。<br/>${B(ctx.close2)}。`,
      full: `先承接保養是長期成本：${sq(ctx, "maintenance", 3)}<br/>回廠頻率與定保對照說明。<br/>${ctx.close2}。`,
      score: "factCheck",
      ragSources: ctx.src,
    }),
    4: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.sound,
      q: `「我家人在意隔音，${C} 跟 ${P} 玻璃、NVH 教材有數據嗎？」`,
      blank: `理解家人乘坐舒適：${Bq(ctx, "sound", 4)}<br/>${B("雙層玻璃／分貝")}可對照教材。<br/>${B("試乘")}讓家人感受。`,
      full: `理解家人乘坐舒適：${sq(ctx, "sound", 4)}<br/>雙層玻璃／分貝可對照教材。<br/>試乘讓家人感受。`,
      score: "factCheck+同理",
      ragSources: ctx.src,
    }),
    5: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.blind,
      q: `「${C} 中控都是螢幕，${P} 冷氣旋鈕／盲操教材怎麼說？」`,
      blank: `操作習慣很重要：${Bq(ctx, "blind", 5)}<br/>${B("實體鍵／語音")}對照說明。<br/>${B("試乘操作")}。`,
      full: `操作習慣很重要：${sq(ctx, "blind", 5)}<br/>實體鍵／語音對照說明。<br/>試乘操作。`,
      score: "factCheck",
      ragSources: ctx.src,
    }),
    6: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.space,
      q: `「我們家有小孩，${C} 跟 ${P} 後座空間、行李廂教材怎麼比？」`,
      blank: `家庭用車看空間：${Bq(ctx, "space", 6)}<br/>${B("後座／行李")}對照。<br/>${B("實車體驗")}最準。`,
      full: `家庭用車看空間：${sq(ctx, "space", 6)}<br/>後座／行李對照。<br/>實車體驗最準。`,
      score: "策略+事實",
      ragSources: ctx.src,
    }),
    7: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.price,
      q: `「${C} 現在促銷很大，${P} 總價跟方案教材怎麼說？」`,
      blank: `價格要看總成本：${Bq(ctx, "price", 7)}<br/>${B("車價＋優惠＋稅")}透明說明。<br/>${B(ctx.close2)}。`,
      full: `價格要看總成本：${sq(ctx, "price", 7)}<br/>車價＋優惠＋稅透明說明。<br/>${ctx.close2}。`,
      score: "factCheck+成交",
      ragSources: ctx.src,
    }),
    8: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.safety,
      q: `「${C} 輔助駕駛很強，${P} ProPILOT／安全配備教材怎麼比？」`,
      blank: `安全是家人關鍵：${Bq(ctx, "safety", 8)}<br/>${B("L2 輔助")}對照同級。<br/>${B("試乘長途感受")}。`,
      full: `安全是家人關鍵：${sq(ctx, "safety", 8)}<br/>L2 輔助對照同級。<br/>試乘長途感受。`,
      score: "factCheck",
      ragSources: ctx.src,
    }),
    9: () => ({
      tags: ["P-01", tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.fuel,
      q: `「我是 ${PERSONAS["P-01"].name}，請把 ${C} 跟 ${P} 的 WLTC 條件跟試算依據講清楚。」`,
      blank: `針對理性客戶：${Bq(ctx, "fuel", 9)}<br/>${B("測試基準")}＋${B("當場試算")}；${B(ctx.close)}。`,
      full: `針對理性客戶：${sq(ctx, "fuel", 9)}<br/>測試基準＋當場試算；${ctx.close}。`,
      score: PERSONAS["P-01"].focus,
      ragSources: ctx.src,
    }),
    10: () => ({
      tags: ["P-03", tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.price,
      q: `「我預算緊，${C} 促銷那麼兇，${P} 總成本教材怎麼說？」`,
      blank: `預算敏感先看總價：${Bq(ctx, "price", 10)}<br/>${B("月供試算")}＋${B("優惠條件")}。<br/>${B(ctx.close2)}。`,
      full: `預算敏感先看總價：${sq(ctx, "price", 10)}<br/>月供試算＋優惠條件。<br/>${ctx.close2}。`,
      score: PERSONAS["P-03"].focus,
      ragSources: ctx.src,
    }),
    11: () => ({
      tags: ["P-05", tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.maintenance,
      q: `「論壇上 ${C} 引擎／耐用討論很多，你們教材數據來源哪裡來？」`,
      blank: `理解您做功課：${Bq(ctx, "maintenance", 11)}<br/>${B("教材出處")}＋${B("不誇大")}。<br/>${B("試乘驗證")}。`,
      full: `理解您做功課：${sq(ctx, "maintenance", 11)}<br/>教材出處＋不誇大。<br/>試乘驗證。`,
      score: PERSONAS["P-05"].focus,
      ragSources: ctx.src,
    }),
    12: () => ({
      tags: [AGES[0].id, tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.space,
      q: `【${AGES[0].label}客戶】「${C} 跟 ${P}，${AGES[0].tone}，空間跟安全怎麼選？」`,
      blank: `${AGES[0].label}家庭：${Bq(ctx, "space", 12)}<br/>安全：${Bq(ctx, "safety", 13)}<br/>${B(ctx.close)}。`,
      full: `${AGES[0].label}家庭：${sq(ctx, "space", 12)}<br/>安全：${sq(ctx, "safety", 13)}<br/>${ctx.close}。`,
      score: "同理+事實",
      ragSources: ctx.src,
    }),
    13: () => ({
      tags: [AGES[1].id, tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.safety,
      q: `【${AGES[1].label}客戶】「${C} 跟 ${P}，${AGES[1].tone}，哪台比較好開、比較省心？」`,
      blank: `${AGES[1].label}重視可靠：${Bq(ctx, "safety", 14)}<br/>保養：${Bq(ctx, "maintenance", 15)}<br/>${B("試乘")}感受。`,
      full: `${AGES[1].label}重視可靠：${sq(ctx, "safety", 14)}<br/>保養：${sq(ctx, "maintenance", 15)}<br/>試乘感受。`,
      score: "同理",
      ragSources: ctx.src,
    }),
    14: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.strategy,
      q: `【情境】客戶問隔音數據，業代：「加 LINE 我傳表。」你該怎麼答？`,
      blank: `LINE 可補細節，但今天先講教材：${Bq(ctx, "sound", 0)}<br/>${B("當場說明")}；${B("數字今天先講清楚")}。`,
      full: `LINE 可補細節，但今天先講教材：${sq(ctx, "sound", 0)}<br/>當場說明；數字今天先講清楚。`,
      score: "strategy",
      ragSources: ctx.src,
    }),
    15: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.strategy,
      q: `【情境】業代只說試乘才準，未當場講保養費用。你該怎麼答？`,
      blank: `試乘要安排，但教材可先說：${Bq(ctx, "maintenance", 1)}<br/>${B("回廠費用範圍")}；試乘驗證體感。`,
      full: `試乘要安排，但教材可先說：${sq(ctx, "maintenance", 1)}<br/>回廠費用範圍；試乘驗證體感。`,
      score: "strategy",
      ragSources: ctx.src,
    }),
    16: () => ({
      tags: [tag, C, "挑戰", "RAG"],
      topic: QA_TOPIC_LABELS.equip,
      q: `「你們講半天都沒具體配備，${C} 科技功能教材差在哪？」`,
      blank: `教材配備重點：${Bq(ctx, "equip", 16)}<br/>${B("同級對照")}；${B(ctx.close)}？`,
      full: `教材配備重點：${sq(ctx, "equip", 16)}<br/>同級對照；${ctx.close}？`,
      score: "factCheck+advance",
      ragSources: ctx.src,
    }),
    17: () => ({
      tags: [tag, C],
      topic: QA_TOPIC_LABELS.equip,
      q: `【RAG 事實 1】客戶：「你剛說的配備依據是什麼？」（${C}）`,
      blank: `依據（Vertex RAG）：${Bq(ctx, "equip", 17)}<br/>${B("不憑空")}；${B("試乘")}驗證。`,
      full: `依據（Vertex RAG）：${sq(ctx, "equip", 17)}<br/>不憑空；試乘驗證。`,
      score: "factCheck",
      ragSources: ctx.src,
    }),
    18: () => ({
      tags: [tag, C],
      topic: QA_TOPIC_LABELS.maintenance,
      q: `【RAG 事實 2】客戶追問耐用／回廠（${C}）`,
      blank: `教材第二點：${Bq(ctx, "maintenance", 18)}<br/>可 ${B("對照銷售助手")}；${B(ctx.close2)}。`,
      full: `教材第二點：${sq(ctx, "maintenance", 18)}<br/>可對照銷售助手；${ctx.close2}。`,
      score: "factCheck",
      ragSources: ctx.src,
    }),
    19: () => {
      const wrong = pickWrongCompetitor(ctx.competitor);
      return {
        tags: [tag, C, "競品錨定", "RAG"],
        topic: QA_TOPIC_LABELS.general,
        q: `【錯誤】業代拿 ${wrong} 來比（客戶在看 ${C}）。你該怎麼拉回？`,
        blank: `【錯誤】${B("比錯車款")}。<br/>正確：回到 ${C}；${Bq(ctx, "general", 19)}。<br/>${B("不攻擊 " + wrong)}。`,
        full: `【錯誤】比錯車款。<br/>正確：回到 ${C}；${sq(ctx, "general", 19)}。<br/>不攻擊 ${wrong}。`,
        score: "strategy+factCheck",
        ragSources: ctx.src,
      };
    },
    20: () => ({
      tags: [tag, C, "RAG"],
      topic: QA_TOPIC_LABELS.advance,
      q: `【最後一輪】客戶要回去跟家人討論，業代怎麼收尾？`,
      blank: `尊重家人討論；帶走 ${B(ctx.close2)}；摘要：${Bq(ctx, topic, 0)}<br/>${B(ctx.close)}；${B("不逼當場下訂")}。`,
      full: `尊重家人討論；帶走${ctx.close2}；摘要：${sq(ctx, topic, 0)}<br/>${ctx.close}；不逼當場下訂。`,
      score: "advance",
      ragSources: ctx.src,
    }),
  };

  const build = templates[slot];
  if (!build) throw new Error(`Missing template for slot ${slot}`);
  return { slot, ...build() };
}

function buildChapterFromRag(ctx: RagChapterInput): CompetitorChapter {
  const prefix = ctx.productLine === "kicks" ? "KS-HRV" : `XT-${ctx.slug.toUpperCase().replace(/-/g, "")}`;
  const buckets = bucketSnippetsByTopic(ctx.snippets);
  const issue = inferPrimaryIssue(ctx.opening, ctx.snippets, ctx.short);
  const hook = inferCustomerHook(ctx.opening, ctx.snippets, ctx.short);
  const themes = collectThemesFromFacts(ctx.facts);
  const profile = COMPETITOR_CHAPTER_PROFILE[ctx.slug];
  if (profile) {
    for (const t of profile.primaryTopics) {
      if (!themes.includes(t)) themes.unshift(t);
    }
  }

  const inner: Ctx = {
    ...ctx,
    buckets,
    issue,
    hook,
    close: ctx.closingActions[0] ?? "邀請試乘",
    close2: ctx.closingActions[1] ?? "提供試算表",
    src: ctx.sources,
    prefix,
  };

  const questions: QA[] = QA_SLOT_TOPIC_MAP.map(({ slot, topic, tag }) => {
    const q = buildQuestion(inner, slot, topic, tag);
    return { ...q, id: mkId(prefix, slot) };
  });

  if (questions.length !== 20) {
    throw new Error(`${ctx.slug}: expected 20 questions, got ${questions.length}`);
  }

  return {
    slug: ctx.slug,
    competitor: ctx.competitor,
    short: ctx.short,
    productLine: ctx.productLine,
    product: ctx.product,
    issue,
    themes: themes.slice(0, 8),
    hook,
    ragSources: ctx.sources,
    questions,
  };
}

export function buildAllChaptersFromRag(inputs: RagChapterInput[]): CompetitorChapter[] {
  return inputs.map(buildChapterFromRag);
}

export const MANIFEST = {
  version: 3,
  title: "競品對答高分指南（RAG 驅動 · 多議題）",
  questionsPerChapter: 20,
  dataSource: "Vertex RAG（snapshot 或 --live 檢索）",
  scenarioDimensions: ROLEPLAY_SCENARIO_DIMENSIONS,
  slotTopicMap: QA_SLOT_TOPIC_MAP.map((s) => ({
    slot: s.slot,
    topic: QA_TOPIC_LABELS[s.topic],
    tag: s.tag,
  })),
  competitorProfiles: COMPETITOR_CHAPTER_PROFILE,
  chapters: [
    { slug: "rav4", file: "xtrail-rav4.json", competitor: "Toyota RAV4", productLine: "xtrail" },
    { slug: "crv", file: "xtrail-crv.json", competitor: "Honda CR-V", productLine: "xtrail" },
    { slug: "tucson", file: "xtrail-tucson.json", competitor: "Hyundai Tucson L", productLine: "xtrail" },
    { slug: "outlander", file: "xtrail-outlander.json", competitor: "Mitsubishi Outlander", productLine: "xtrail" },
    { slug: "sportage", file: "xtrail-sportage.json", competitor: "KIA Sportage", productLine: "xtrail" },
    { slug: "kicks-hrv", file: "kicks-hrv.json", competitor: "KICKS vs HR-V", productLine: "kicks" },
  ],
};

export { ROLEPLAY_SCENARIO_DIMENSIONS, QA_SLOT_TOPIC_MAP, COMPETITOR_CHAPTER_PROFILE };
