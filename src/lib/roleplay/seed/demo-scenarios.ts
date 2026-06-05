import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";

export const DEMO_ROLEPLAY_SCENARIOS: RoleplayScenario[] = [
  {
    scenarioId: "KB-T33-001",
    sectionA: {
      title: "X-TRAIL 油耗被 RAV4 比下去？",
      productLine: "xtrail-ice",
      productDisplayName: "X-TRAIL ICE",
      competitor: "Toyota RAV4",
      coreIssue: "客戶認為竞品油耗更低，質疑 X-TRAIL 日常用車成本",
    },
    sectionB: {
      openingLine:
        "我最近在比 X-TRAIL 跟 RAV4，網路上都說 RAV4 比較省油。你們這台真的不會比較貴嗎？",
      followUps: [
        "那你有沒有實際路況的數據？官網數字我都看過了。",
        "如果油耗差不多，那為什麼我要選你們而不是 RAV4？",
        "你剛說的配備我沒興趣，我就想知道一年油錢差多少。",
        "聽起來還是很空，能不能給我一個具體試算？",
      ],
    },
    sectionC: {
      facts: [
        { label: "X-TRAIL 綜合油耗", value: "約 14.3 km/L（WLTC，依等級）" },
        { label: "同級競品對照", value: "需說明測試基準一致，避免斷章取義" },
        { label: "ProPILOT", value: "同級少見 L2 輔助，長途舒適與安全" },
        { label: "試算方式", value: "年里程 × 油價 ÷ 油耗，再比較差額" },
      ],
    },
    sectionD: {
      keyPoints: [
        "先同理客戶比較油耗的動機",
        "用一致基準說明油耗，並轉到總持有成本",
        "帶出 ProPILOT、空間、舒適等同級優勢",
        "邀請試乘體感與實際路況討論",
      ],
      forbidden: [
        "直接攻擊競品品質差",
        "保證一定比競品省油",
        "未經查證的數據",
      ],
      closingActions: ["邀請試乘", "提供油耗試算表", "約第二次到店"],
    },
    sectionE: {
      difficulty: "advanced",
      maxTurns: 5,
      personaId: "P-01",
    },
    sectionF: {
      criteria: [
        {
          dimensionId: "empathy",
          highExample: "先認同客戶會比較油耗很合理，再進入說明",
          lowExample: "一開始就反駁客戶錯誤",
        },
        {
          dimensionId: "factCheck",
          highExample: "引用 WLTC 基準並說明試算方式",
          lowExample: "誇大或憑空數字",
        },
        {
          dimensionId: "strategy",
          highExample: "油耗 + 配備 + 試乘三段式回應",
          lowExample: "只重複官話術",
        },
      ],
    },
  },
  {
    scenarioId: "KB-T33-002",
    sectionA: {
      title: "KICKS 價格與 HR-V 促銷比較",
      productLine: "kicks",
      productDisplayName: "KICKS",
      competitor: "Honda HR-V",
      coreIssue: "客戶看到競品端促銷，質疑 KICKS 性價比",
    },
    sectionB: {
      openingLine: "HR-V 現在促銷很大，KICKS 有什麼比較划算的？不然我就去別家看了。",
      followUps: [
        "你說的優惠是現在有嗎？還是要等我下訂才有？",
        "我預算有限，月供能不能再低一點？",
        "如果今天沒辦法給我明確方案，我可能就不等了。",
      ],
    },
    sectionC: {
      facts: [
        { label: "KICKS 定位", value: "都會 crossover，省油、好停車" },
        { label: "優惠說明", value: "需依總部當月方案，避免口頭亂承諾" },
        { label: "總價思維", value: "車價、保養、油耗、保險一併說明" },
      ],
    },
    sectionD: {
      keyPoints: [
        "確認客戶預算與決策時間點",
        "透明說明現有優惠與條件",
        "強調 KICKS 都會用車優勢",
        "提出可執行的今日下一步",
      ],
      forbidden: ["承諾未公布的折扣", "貶低他牌客戶選擇"],
      closingActions: ["試算月供", "保留優惠名額", "約今日試乘"],
    },
    sectionE: {
      difficulty: "advanced",
      maxTurns: 5,
      personaId: "P-03",
    },
    sectionF: {
      criteria: [
        {
          dimensionId: "advance",
          highExample: "提出具體試算與今日可執行方案",
          lowExample: "只說「回去考慮」無下一步",
        },
        {
          dimensionId: "structure",
          highExample: "先預算→優惠→產品價值→行動",
          lowExample: "回答散亂跳題",
        },
      ],
    },
  },
];
