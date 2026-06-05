import type { RoleplayGlobalConfig } from "@/lib/roleplay/scenario-contract";



export const ROLEPLAY_GLOBAL_CONFIG: RoleplayGlobalConfig = {

  personas: [

    {

      id: "P-01",

      name: "理性分析型",

      style: "冷靜、主動引用油耗數字，邏輯性追問嚴格",

      traits: ["重視測試條件與試算", "要求數據來源", "決策前反覆比較"],

      decisionMode: "需精確說明測試條件與試算，最接近真實情境",

    },

    {

      id: "P-02",

      name: "情感品牌型",

      style: "較不在意油耗數字，易轉移到品牌感受",

      traits: ["談駕駛感受與品牌信任", "油耗話題易岔開", "重視服務態度"],

      decisionMode: "若業代只談數字可能失去興趣，需適度拉回產品價值",

    },

    {

      id: "P-03",

      name: "預算敏感型",

      style: "把油耗換算年度費用，要求總持有成本比較",

      traits: ["在意促銷與優惠", "要求即時試算", "比較購車總成本"],

      decisionMode: "有清楚價格與年度油費試算才願意往下談",

    },

    {

      id: "P-04",

      name: "猶豫從眾型",

      style: "提出異議後易被說服，但常說要回去商量",

      traits: ["語氣較溫和", "易被說服", "決策延後", "訓練強度較低"],

      decisionMode: "需要業代給明確下一步，否則以「跟家人商量」結束",

    },

    {

      id: "P-05",

      name: "深度研究型",

      style: "已看論壇討論，對測試條件有固定成見",

      traits: ["追問最深", "質疑官方數字", "熟記網路評價"],

      decisionMode: "業代必須熟記數字與來源，否則難以建立信任",

    },

    /** 相容舊 demo */

    {

      id: "analyst",

      name: "理性分析型",

      style: "冷靜、比較數據、會追問細節",

      traits: ["重視油耗與安全數據", "不喜空泛形容"],

      decisionMode: "需具體數字與來源才願意往下談試乘",

    },

    {

      id: "budget",

      name: "預算敏感型",

      style: "直接、在意總價與優惠",

      traits: ["常提競品促銷", "擔心養車成本"],

      decisionMode: "有清楚價格方案與優惠才考慮留資料",

    },

  ],

  rubricDimensions: [

    { id: "empathy", label: "同理承接", weight: 0.2 },

    { id: "structure", label: "論點完整度", weight: 0.2 },

    { id: "factCheck", label: "事實引用正確", weight: 0.2 },

    { id: "strategy", label: "策略使用", weight: 0.2 },

    { id: "advance", label: "推進成交", weight: 0.2 },

  ],

  gradeBands: [

    { grade: "S", min: 90, max: 100, label: "卓越", advice: "可擔任情境示範，協助新人演練。" },

    { grade: "A", min: 80, max: 89, label: "優秀", advice: "表現穩定，可挑戰更高難度情境。" },

    { grade: "B", min: 70, max: 79, label: "合格", advice: "建議複習佐證資料與禁止說法後再練一次。" },

    { grade: "C", min: 60, max: 69, label: "待加強", advice: "需補強事實查核與結構化回應。" },

    { grade: "D", min: 0, max: 59, label: "需輔導", advice: "建議先從素材區熟悉情境與標準話術。" },

  ],

};



export const ROLEPLAY_PERSONA_IDS = ["P-01", "P-02", "P-03", "P-04", "P-05"] as const;


