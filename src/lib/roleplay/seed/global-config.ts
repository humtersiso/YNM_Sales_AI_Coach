import type { RoleplayGlobalConfig } from "@/lib/roleplay/scenario-contract";

export const ROLEPLAY_GLOBAL_CONFIG: RoleplayGlobalConfig = {
  personas: [
    {
      id: "analyst",
      name: "理性分析型",
      style: "冷靜、比較數據、會追問細節",
      traits: ["重視油耗與安全數據", "不喜空泛形容", "決策前要比較三家"],
      decisionMode: "需具體數字與來源才願意往下談試乘",
    },
    {
      id: "budget",
      name: "預算敏感型",
      style: "直接、在意總價與優惠",
      traits: ["常提競品促銷", "擔心養車成本", "希望今天能拿到明確報價"],
      decisionMode: "有清楚價格方案與優惠才考慮留資料",
    },
  ],
  rubricDimensions: [
    { id: "empathy", label: "同理承接", weight: 0.2 },
    { id: "accuracy", label: "論點與事實正確", weight: 0.25 },
    { id: "structure", label: "論點完整度", weight: 0.2 },
    { id: "strategy", label: "策略運用", weight: 0.2 },
    { id: "advance", label: "推進成交", weight: 0.15 },
  ],
  gradeBands: [
    { grade: "S", min: 90, max: 100, label: "卓越", advice: "可擔任情境示範，協助新人演練。" },
    { grade: "A", min: 80, max: 89, label: "優秀", advice: "表現穩定，可挑戰更高難度情境。" },
    { grade: "B", min: 70, max: 79, label: "合格", advice: "建議複習佐證資料與禁止說法後再練一次。" },
    { grade: "C", min: 60, max: 69, label: "待加強", advice: "需補強事實查核與結構化回應。" },
    { grade: "D", min: 0, max: 59, label: "需輔導", advice: "建議先從素材區熟悉情境與標準話術。" },
  ],
};
