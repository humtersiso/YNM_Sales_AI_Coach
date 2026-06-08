/**
 * 產生 docs/ROLEPLAY_RAG_QA_DRILL.html（100+ 題情境模擬 QA）
 * 用法：node scripts/ops/generate-roleplay-rag-qa-drill.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outPath = path.join(webRoot, "docs/ROLEPLAY_RAG_QA_DRILL.html");

/** @param {string} answer */
function B(answer) {
  const safe = String(answer).replace(/"/g, "&quot;");
  return `<span class="blank" data-answer="${safe}">＿＿＿</span>`;
}

/** @typedef {{ id: string; tags: string[]; q: string; blank: string; full: string; score?: string }} QA */

const PERSONAS = [
  { id: "P-01", name: "理性分析型", focus: "數據、WLTC、試算公式" },
  { id: "P-02", name: "情感品牌型", focus: "駕駛感受、服務、試乘體感" },
  { id: "P-03", name: "預算敏感型", focus: "總價、月供、年油費、促銷" },
  { id: "P-04", name: "猶豫從眾型", focus: "小步驟、家人商量、二訪" },
  { id: "P-05", name: "深度研究型", focus: "論壇質疑、測試條件、來源查核" },
];

const AGES = [
  { id: "20-30", label: "20–30 歲", tone: "首購、預算緊" },
  { id: "30-40", label: "30–40 歲", tone: "家庭用車、比較理性" },
  { id: "40-50", label: "40–50 歲", tone: "重視舒適與安全" },
  { id: "50+", label: "50 歲以上", tone: "重視可靠與好上手" },
];

const DIFFICULTIES = [
  { id: "beginner", label: "新手", tip: "客戶 1～2 輪後語氣緩和，仍要給試算／試乘" },
  { id: "advanced", label: "進階", tip: "說服後仍拋新疑慮，策略要輪換" },
  { id: "challenge", label: "挑戰", tip: "強硬要求數字，禁止空泛話術" },
];

const XTRAIL = {
  product: "X-TRAIL ICE",
  kmL: "14.3",
  yearKm: "15,000",
  gasPrice: "30",
  yearCost: "31,469",
  diff: "ProPILOT L2 輔助、空間舒適、長途體感",
};

const KICKS = {
  product: "KICKS",
  positioning: "都會 crossover，省油、好停車",
};

/** @type {{ slug: string; competitor: string; short: string; issue: string; hook: string; facts: {label:string;value:string}[] }[]} */
const XTRAIL_COMPETITORS = [
  {
    slug: "rav4",
    competitor: "Toyota RAV4",
    short: "RAV4",
    issue: "油耗／持有成本",
    hook: "網路上都說 RAV4 比較省油",
    facts: [
      { label: "綜合油耗", value: "約 14.3 km/L（WLTC，依等級）" },
      { label: "試算", value: "15,000 km × 30 元 ÷ 14.3 ≈ 31,469 元／年" },
      { label: "差異化", value: "ProPILOT、空間、舒適" },
    ],
  },
  {
    slug: "crv",
    competitor: "Honda CR-V",
    short: "CR-V",
    issue: "空間／口碑／油耗",
    hook: "CR-V 口碑好、後座空間也大",
    facts: [
      { label: "比較原則", value: "同 WLTC 比油耗；空間用試乘驗證" },
      { label: "X-TRAIL 訴求", value: "ProPILOT、五人乘坐＋行李" },
    ],
  },
  {
    slug: "tucson",
    competitor: "Hyundai Tucson L",
    short: "Tucson L",
    issue: "配備／性價比",
    hook: "Tucson L 配備給很多、價格又有競爭力",
    facts: [
      { label: "回應原則", value: "比常用功能與長期成本，不拼規格表" },
      { label: "優惠", value: "依總部當月方案，不口頭加碼" },
    ],
  },
  {
    slug: "outlander",
    competitor: "Mitsubishi Outlander",
    short: "Outlander",
    issue: "七人座／空間",
    hook: "Outlander 有七人座，一家出遊比較實用",
    facts: [
      { label: "定位", value: "七人需求選 Outlander；五人舒適選 X-TRAIL" },
      { label: "油耗", value: "五人綜合約 14.3 km/L（WLTC）" },
    ],
  },
  {
    slug: "sportage",
    competitor: "KIA Sportage",
    short: "Sportage",
    issue: "產品週期／油電切換／零件",
    hook: "Sportage 配備很新，韓系保養會不會比較麻煩？",
    facts: [
      { label: "對戰重點", value: "比長期持有成本與產品週期，不人身攻擊" },
      { label: "X-TRAIL 訴求", value: "ProPILOT、空間舒適、國產保修能量" },
    ],
  },
];

const VC_TURBO_MAINT = {
  engine: "1.5T VC-TURBO",
  reliability: "成熟量產技術、原廠保固與保修據點",
  maint8w: "約 3.2 萬元（8 萬公里累計定保，教材參考）",
  tucsonMaint: "Tucson L 約 4.1 萬元（同里程教材參考）",
  forumMyth: "論壇「一年 2～5 千」常未載明里程與工項",
};

let qaCounter = 0;
/** @type {QA[]} */
const ALL_QAS = [];

/** @param {Omit<QA,"id"> & { id?: string }} q */
function addQa(q) {
  qaCounter += 1;
  ALL_QAS.push({ ...q, id: q.id ?? `Q${String(qaCounter).padStart(3, "0")}` });
}

// ─── 攻略總覽 ───
function addGuideQas() {
  addQa({
    tags: ["攻略", "五維"],
    q: "【自我檢核】每一輪回覆的標準結構？",
    blank: `① ${B("承接疑慮")} → ② ${B("事實／WLTC／試算")} → ③ ${B("本品差異")} → ④ ${B("試乘或試算邀約")}。`,
    full: "① 承接疑慮 → ② 事實／WLTC／試算 → ③ 本品差異 → ④ 試乘或試算邀約。",
    score: "論點完整度",
  });
  addQa({
    tags: ["攻略", "五輪"],
    q: "【五輪節奏】各輪業代目標？",
    blank: `R1 ${B("同理")}；R2 ${B("事實試算")}；R3 ${B("差異價值")}；R4 ${B("補弱項")}；R5 ${B("明確下一步")}。`,
    full: "R1 同理；R2 事實試算；R3 差異價值；R4 補弱項；R5 明確下一步。",
    score: "推進成交",
  });
  for (const d of DIFFICULTIES) {
    addQa({
      tags: ["攻略", d.label],
      q: `【${d.label}難度】客戶行為與業代對策？`,
      blank: `${d.label}：${B(d.tip)}。`,
      full: `${d.label}：${d.tip}。`,
      score: "策略使用",
    });
  }
}

// ─── X-TRAIL × 競品：標準六輪題庫 ───
/**
 * @param {typeof XTRAIL_COMPETITORS[0]} comp
 * @param {string} roundTag
 * @param {string} customerQ
 * @param {string} blankAns
 * @param {string} fullAns
 * @param {string[]} extraTags
 */
function addScenarioRound(comp, roundTag, customerQ, blankAns, fullAns, extraTags = []) {
  addQa({
    tags: [XTRAIL.product, comp.short, roundTag, ...extraTags],
    q: customerQ,
    blank: blankAns,
    full: fullAns,
    score: roundTag.includes("R1") ? "同理+事實" : roundTag.includes("R5") ? "成交" : "策略+事實",
  });
}

function generateXtrailCompetitorChapter(comp) {
  const P = XTRAIL.product;
  const C = comp.short;
  const cFull = comp.competitor;

  addScenarioRound(
    comp,
    "R1 開場",
    `「我最近在比 ${P} 跟 ${C}，${comp.hook}。你們值得考慮嗎？」`,
    `理解您會比較${B("油耗／成本／空間")}，這很合理。<br/>${P} 綜合油耗約 ${B(XTRAIL.kmL + " km/L")}（${B("WLTC")}），比較要用 ${B("同一測試基準")}。<br/>年里程 ${B(XTRAIL.yearKm)}、油價 ${B(XTRAIL.gasPrice)} 元 → 年油費約 ${B(XTRAIL.yearCost)} 元。<br/>同級還有 ${B("ProPILOT")}；這週 ${B("六上午")} ${B("試乘 30 分鐘")} 方便嗎？`,
    `理解您會比較油耗／成本／空間，這很合理。<br/>${P} 綜合油耗約 ${XTRAIL.kmL} km/L（WLTC），比較要用同一測試基準。<br/>年里程 ${XTRAIL.yearKm}、油價 ${XTRAIL.gasPrice} 元 → 年油費約 ${XTRAIL.yearCost} 元。<br/>同級還有 ProPILOT；這週六上午試乘 30 分鐘方便嗎？`,
  );

  addScenarioRound(
    comp,
    "R2 追數據",
    `「${C} 官網數字我都看過了，有沒有實際路況？WLTC 跟真實差很多吧？」`,
    `WLTC 是 ${B("法規統一測試")}，用於 ${B("同級橫向比較")}，不保證個人實際油耗。<br/>受 ${B("市區／高速比例")} 影響；我們不說 ${B("一定比較省")}。<br/>用您的 ${B("年里程")} 試算＋${B("試乘")}；${C} 數字可核對 ${B("同等等級")}。`,
    `WLTC 是法規統一測試，用於同級橫向比較，不保證個人實際油耗。<br/>受市區／高速比例影響；我們不說一定比較省。<br/>用您的年里程試算＋試乘；${C} 數字可核對同等等級。`,
    ["P-05"],
  );

  addScenarioRound(
    comp,
    "R3 選擇理由",
    `「如果油耗差不多，為什麼要選 ${P} 不選 ${C}？」`,
    `同一基準下差距不大時，看 ${B("總持有成本")}：油費＋${B("保養、保險、配備價值")}。<br/>${P} 有 ${B(XTRAIL.diff)}；不攻擊 ${C}，邀請 ${B("試乘比較體感")}。`,
    `同一基準下差距不大時，看總持有成本：油費＋保養、保險、配備價值。<br/>${P} 有 ${XTRAIL.diff}；不攻擊 ${C}，邀請試乘比較體感。`,
  );

  addScenarioRound(
    comp,
    "R4 縮小範圍",
    `「配備我不在意，就告訴我一年油錢跟 ${C} 差多少。」`,
    `專注油錢：請問年里程？油價先用 ${B(XTRAIL.gasPrice)} 元。<br/>${P} ${B(XTRAIL.kmL)} km/L → 公式 ${B("年里程×油價÷油耗")} → ${B("當場試算")}。<br/>${B("試算表")}留給您，${B("明天下午")} ${B("二訪")}確認？`,
    `專注油錢：請問年里程？油價先用 ${XTRAIL.gasPrice} 元。<br/>${P} ${XTRAIL.kmL} km/L → 公式年里程×油價÷油耗 → 當場試算。<br/>試算表留給您，明天下午二訪確認？`,
    ["P-03"],
  );

  addScenarioRound(
    comp,
    "R5 逼試算",
    `「聽起來很空，給具體試算，不然我去 ${cFull} 了。」`,
    `現在算：${XTRAIL.yearKm}×${XTRAIL.gasPrice}÷${XTRAIL.kmL}≈${B(XTRAIL.yearCost)} 元／年。<br/>${C} 用您提供的 km/L 同公式 → 差額 ${B("當場計算")}。<br/>今天 ${B("17:00")} ${B("試乘 30 分鐘")}？`,
    `現在算：${XTRAIL.yearKm}×${XTRAIL.gasPrice}÷${XTRAIL.kmL}≈${XTRAIL.yearCost} 元／年。<br/>${C} 用您提供的 km/L 同公式 → 差額當場計算。<br/>今天 17:00 試乘 30 分鐘？`,
    ["挑戰"],
  );

  addScenarioRound(
    comp,
    "R6 離場",
    `「我今天沒得到滿意答案，就先走了。」`,
    `理解您要 ${B("可執行方案")}：${B("當月方案")}＋${B("油耗試算")}＋${B("試乘時段")}。<br/>先 ${B("保留名額至日期")}，您商量後再確認？`,
    `理解您要可執行方案：當月方案＋油耗試算＋試乘時段。<br/>先保留名額至日期，您商量後再確認？`,
    ["P-04"],
  );

  // 競品專屬追問
  const extraByComp = {
    rav4: [
      `「Toyota 保值又好，日產會不會比較沒那麼熱門？」`,
      `「RAV4 混動版很紅，你們 ICE 會不會很耗？」`,
    ],
    crv: [
      `「CR-V 後座跟行李空間感覺都比較大。」`,
      `「Honda 比較有面子吧？」`,
    ],
    tucson: [
      `「Tucson 現金優惠比較直接，你們呢？」`,
      `「韓系配備比較敢給，你們 ProPILOT 有比較厲害嗎？」`,
    ],
    outlander: [
      `「我們常六、七人出遊，五人車夠嗎？」`,
      `「Outlander 也有安全配備，差在哪？」`,
    ],
    sportage: [
      `「Sportage 配備很敢給，你們 ProPILOT 有比較厲害嗎？」`,
      `「韓系零件會不會比較難等、保養比較貴？」`,
    ],
  };
  for (const q of extraByComp[comp.slug] ?? []) {
    addScenarioRound(
      comp,
      "競品專屬",
      `「${q.slice(1)}`,
      `先 ${B("承接")}：您在意 ${B(comp.issue.split("／")[0])} 很合理。<br/>${P} 強在 ${B(XTRAIL.diff.split("、")[0])}；若 ${B("座位需求")} 是關鍵我們可實際 ${B("試乘／量測")}。<br/>${B("不攻擊競品")}，用試算與體感決定。`,
      `先承接：您在意${comp.issue.split("／")[0]}很合理。<br/>${P} 強在${XTRAIL.diff.split("、")[0]}；若座位需求是關鍵我們可實際試乘／量測。<br/>不攻擊競品，用試算與體感決定。`,
    );
  }
}

// ─── 人設 × 競品 開場變體 ───
function generatePersonaCompetitorVariants() {
  for (const comp of XTRAIL_COMPETITORS) {
    for (const p of PERSONAS) {
      const questions = {
        "P-01": `「我是 ${p.name}，請把 ${comp.short} 跟 ${XTRAIL.product} 的 WLTC 條件跟試算公式講清楚。」`,
        "P-02": `「我不太看數字，${comp.short} 跟 ${XTRAIL.product} 開起來、服務上差在哪？」`,
        "P-03": `「我預算緊，${comp.short} 促銷那麼兇，${XTRAIL.product} 一年總共多花多少？」`,
        "P-04": `「聽起來都可以，但我得跟家人商量，你們能給什麼讓我帶回去討論？」`,
        "P-05": `「論壇上 ${comp.short} 贏面大，你們數據來源哪裡來的？」`,
      };
      const blanks = {
        "P-01": `WLTC 來自 ${B("法規測試")}；${XTRAIL.product} 約 ${B(XTRAIL.kmL + " km/L")}；公式 ${B("年里程×油價÷油耗")} 當場算。`,
        "P-02": `了解您重視 ${B("感受與服務")}；${B("30 分鐘試乘")} 比規格表準；數字簡短帶過。`,
        "P-03": `透明 ${B("當月方案")}＋${B("年油費試算")}＋${B("月供")} 一起看總價。`,
        "P-04": `給 ${B("試算表＋方案摘要")}；小步驟 ${B("週六家人試乘")} 或 ${B("二訪")}。`,
        "P-05": `數字來自 ${B("官網 WLTC")}；論壇截圖核對 ${B("等級與條件")}；不迴避不瞎掰。`,
      };
      const fulls = {
        "P-01": `WLTC 來自法規測試；${XTRAIL.product} 約 ${XTRAIL.kmL} km/L；公式年里程×油價÷油耗當場算。`,
        "P-02": `了解您重視感受與服務；30 分鐘試乘比規格表準；數字簡短帶過。`,
        "P-03": `透明當月方案＋年油費試算＋月供一起看總價。`,
        "P-04": `給試算表＋方案摘要；小步驟週六家人試乘或二訪。`,
        "P-05": `數字來自官網 WLTC；論壇截圖核對等級與條件；不迴避不瞎掰。`,
      };
      addQa({
        tags: [XTRAIL.product, comp.short, p.id, "人設開場"],
        q: questions[p.id],
        blank: blanks[p.id],
        full: fulls[p.id],
        score: `人設 ${p.focus}`,
      });
    }
  }
}

// ─── 年齡 × 競品 ───
function generateAgeVariants() {
  for (const comp of XTRAIL_COMPETITORS) {
    for (const age of AGES) {
      addQa({
        tags: [XTRAIL.product, comp.short, age.id, "年齡"],
        q: `【${age.label}客戶】「我們這年紀${age.tone}，${comp.short} 跟 ${XTRAIL.product} 怎麼選？」`,
        blank: `${age.label} 常重視 ${B(age.tone.includes("舒適") ? "舒適與安全" : age.tone.includes("預算") ? "總價與月供" : "空間與試算")}。<br/>${B("試乘")}＋${B("油耗試算")} 依您的 ${B("年里程")}；${B("不攻擊 " + comp.short)}。`,
        full: `${age.label} 常重視${age.tone.includes("舒適") ? "舒適與安全" : age.tone.includes("預算") ? "總價與月供" : "空間與試算"}。<br/>試乘＋油耗試算依您的年里程；不攻擊 ${comp.short}。`,
      });
    }
  }
}

// ─── KICKS vs HR-V ───
function generateKicksChapter() {
  const P = KICKS.product;
  const C = "HR-V";
  const rounds = [
    {
      tag: "R1 開場",
      q: `「${C} 現在促銷很大，${P} 有什麼划算？不然我去別家。」`,
      blank: `了解您看到 ${C} 促銷；${B("預算與時間點")} 重要。<br/>${P} 依 ${B("總部當月方案")} ${B("透明說明")}；${KICKS.positioning}。<br/>${B("試算月供")}＋${B("今日試乘")}？`,
      full: `了解您看到 ${C} 促銷；預算與時間點重要。<br/>${P} 依總部當月方案透明說明；${KICKS.positioning}。<br/>試算月供＋今日試乘？`,
    },
    {
      tag: "R2 優惠",
      q: `「優惠是現在有嗎？還是要下訂才有？」`,
      blank: `方案為 ${B("本月總部公告")}；下訂以 ${B("當時公告")} 為準。<br/>先 ${B("試算月供")} 再 ${B("試乘")}。`,
      full: `方案為本月總部公告；下訂以當時公告為準。<br/>先試算月供再試乘。`,
    },
    {
      tag: "R3 月供",
      q: `「月供能不能再低？我預算真的緊。」`,
      blank: `看 ${B("頭期")}與 ${B("期數")}；月供 ${B("當場試算")}；可看 ${B("原廠金融")}。`,
      full: `看頭期與期數；月供當場試算；可看原廠金融。`,
    },
    {
      tag: "R4 離場",
      q: `「今天沒明確方案我就不等了。」`,
      blank: `承諾 ${B("方案內容")}＋${B("月供試算")}＋${B("試乘時段")}；${B("保留名額")}。`,
      full: `承諾方案內容＋月供試算＋試乘時段；保留名額。`,
    },
    {
      tag: "R5 都會",
      q: `「我都在市區開，${P} 跟 ${C} 哪台比較好停、比較省？」`,
      blank: `${P} ${B("都會 crossover")}、${B("好停車")}；油耗用 ${B("WLTC")} 同基準試算。<br/>${B("試乘市區路況")} 最準。`,
      full: `${P} 都會 crossover、好停車；油耗用 WLTC 同基準試算。<br/>試乘市區路況最準。`,
    },
    {
      tag: "R6 保養",
      q: `「${C} 保養聽說也不貴，你們養車成本呢？」`,
      blank: `總價看 ${B("車價+保養+油耗+保險")}；${B("當月保養方案")} 依公告說明。<br/>${B("試算總持有成本")} 給您帶回。`,
      full: `總價看車價+保養+油耗+保險；當月保養方案依公告說明。<br/>試算總持有成本給您帶回。`,
    },
  ];
  for (const r of rounds) {
    addQa({
      tags: [P, C, r.tag],
      q: `「${r.q.slice(1)}`,
      blank: r.blank,
      full: r.full,
    });
  }
  for (const p of PERSONAS) {
    addQa({
      tags: [P, C, p.id, "人設"],
      q: `【${p.name}】「${C} 跟 ${P}，${p.focus}，你怎麼建議？」`,
      blank: `針對 ${p.name}：${B(p.focus.split("、")[0])} 優先；${B("透明方案")}＋${B("試算")}＋${B("試乘")}。`,
      full: `針對 ${p.name}：${p.focus.split("、")[0]} 優先；透明方案＋試算＋試乘。`,
    });
  }
}

// ─── 人設專章（通用追問）───
function generatePersonaChapter() {
  const challenges = {
    "P-01": [
      "測試條件、等級、數據來源一次講完。",
      "用 15,000 公里當例子，當場算給我看。",
      "你剛說的數字跟官網哪個等級？",
    ],
    "P-02": [
      "數字太枯燥，我想知道開起來爽不爽。",
      "品牌信任感你們怎麼建立？",
      "服務好不好比規格重要。",
    ],
    "P-03": [
      "別講配備，總價、月供、一年花多少一次講完。",
      "優惠能不能再低？",
      "跟競品比，我一年多花多少？",
    ],
    "P-04": [
      "聽起來不錯，但要跟家人商量。",
      "你們能不能給我帶回去的資料？",
      "我比較慢決定，不要逼我。",
    ],
    "P-05": [
      "論壇說你們油耗灌水，怎麼證明？",
      "網路評價說競品比較好，你怎麼看？",
      "官方數字我不信，有第三方嗎？",
    ],
  };
  for (const p of PERSONAS) {
    for (const line of challenges[p.id]) {
      addQa({
        tags: [p.id, "人設專章"],
        q: `【${p.name}】「${line}」`,
        blank: `針對 ${p.name}：${B("先承接")} → ${B(p.focus.split("、")[0])} → ${B("試乘或試算")} 具體下一步。`,
        full: `針對 ${p.name}：先承接 → ${p.focus.split("、")[0]} → 試乘或試算具體下一步。`,
        score: p.focus,
      });
    }
  }
}

// ─── 地雷題（禁止說法反向）───
function generateTrapQuestions() {
  const traps = [
    {
      q: "「RAV4 品質就是比較爛對吧？選我們就對了。」（業代若這樣說，客戶會…）",
      blank: `【錯誤】${B("攻擊競品")}。正確：${B("比基準與條件")}，不比人身。`,
      full: "【錯誤】攻擊競品。正確：比基準與條件，不比人身。",
      score: "factCheck+strategy 扣分",
    },
    {
      q: "「我保證一定比 RAV4 省油。」（業代若這樣說…）",
      blank: `【錯誤】${B("保證一定贏")}。正確：${B("WLTC 基準")}＋${B("試算")}，不保證實際。`,
      full: "【錯誤】保證一定贏。正確：WLTC 基準＋試算，不保證實際。",
    },
    {
      q: "「我私下再送您兩萬，別跟別人說。」（業代若這樣說…）",
      blank: `【錯誤】${B("未公布折扣")}。正確：${B("總部當月方案")} 透明說明。`,
      full: "【錯誤】未公布折扣。正確：總部當月方案透明說明。",
    },
    {
      q: "「你怎麼會去看那台車？」（業代若這樣說…）",
      blank: `【錯誤】${B("貶低客戶選擇")}。正確：${B("認可比較動機")}。`,
      full: "【錯誤】貶低客戶選擇。正確：認可比較動機。",
    },
    {
      q: "「大概一年差一萬啦，差不多啦。」（沒有試算…）",
      blank: `【錯誤】${B("憑空數字")}。正確：${B("年里程×油價÷油耗")} 當場算。`,
      full: "【錯誤】憑空數字。正確：年里程×油價÷油耗當場算。",
    },
  ];
  for (const t of traps) {
    addQa({ tags: ["地雷", "禁止說法"], q: t.q, blank: t.blank, full: t.full, score: t.score });
  }
}

// ─── 輪數壓縮策略 ───
function generateTurnCountStrategies() {
  for (const n of [3, 4, 5, 7, 10]) {
    addQa({
      tags: ["輪數", `${n}輪`],
      q: `【練習 ${n} 輪】業代節奏怎麼壓縮？`,
      blank:
        n <= 3
          ? `${B("承接")}→${B("事實試算")}→${B("試乘邀約")} 三步步走完。`
          : n <= 5
            ? `標準五輪；${n} 輪時 R${n} 必須 ${B("明確下一步")}。`
            : `${n} 輪避免重複；每 2 輪 ${B("策略輪換")}。`,
      full:
        n <= 3
          ? "承接→事實試算→試乘邀約三步步走完。"
          : n <= 5
            ? `標準五輪；${n} 輪時最後一輪必須明確下一步。`
            : `${n} 輪避免重複；每 2 輪策略輪換。`,
    });
  }
}

// ─── 動態情境模擬（隨機組合標籤）───
function generateDynamicScenarioSims() {
  const issues = ["油耗", "空間", "配備", "價格", "安全", "促銷"];
  const openings = [
    (p, c, i) => `「${p} 跟 ${c} 比，我最在意${i}，你先講重點。」`,
    (p, c, i) => `「朋友推薦 ${c}，你們 ${p} 的${i}有比較好嗎？」`,
    (p, c, i) => `「我功課做一半了，${i}這塊你們贏 ${c} 在哪？」`,
  ];
  let n = 0;
  for (const comp of XTRAIL_COMPETITORS) {
    for (const issue of issues) {
      for (const tmpl of openings) {
        if (n >= 24) break;
        const q = tmpl(XTRAIL.product, comp.short, issue);
        addQa({
          tags: [XTRAIL.product, comp.short, "動態模擬", issue],
          q,
          blank: `承接${issue}疑慮 → ${B("WLTC或方案基準")} → ${B(XTRAIL.diff.split("、")[0])} → ${B("試乘/試算")}。`,
          full: `承接${issue}疑慮 → WLTC或方案基準 → ${XTRAIL.diff.split("、")[0]} → 試乘/試算。`,
        });
        n += 1;
      }
    }
  }
}

// ─── VC-TURBO／妥善率／回廠費用／SPORTAGE 專章（對練高頻）───
function generateVcTurboMaintenanceChapter() {
  const P = XTRAIL.product;
  const M = VC_TURBO_MAINT;

  addQa({
    tags: [P, "VC-TURBO", "妥善率", "P-05"],
    q: `「${P} 的 ${M.engine} 妥善率怎樣？新技術會不會常壞？」`,
    blank: `先 ${B("同理")} 對新技術的疑慮。<br/>${M.engine} 為 ${B("可變壓縮比")}、${B("全球量產成熟")} 動力，非短期實驗機。<br/>強調 ${B(M.reliability)}；${B("不承諾零故障")}。<br/>邀請 ${B("試乘")}＋提供 ${B("保固／保養手冊")} 對照。`,
    full: `先同理對新技術的疑慮。<br/>${M.engine} 為可變壓縮比、全球量產成熟動力，非短期實驗機。<br/>強調${M.reliability}；不承諾零故障。<br/>邀請試乘＋提供保固／保養手冊對照。`,
    score: "factCheck + 同理",
  });

  addQa({
    tags: [P, "保養", "回廠費用", "P-03"],
    q: `「論壇說 ${P} 回廠保養一年只要兩三千，真的嗎？」`,
    blank: `${B("不未查證即認同")} 論壇金額。<br/>${M.forumMyth}；應依 ${B("官方保養表")}＋${B("當次工項報價")}。<br/>教材參考：8 萬公里累計定保約 ${B(M.maint8w)}（低於 Tucson L 約 ${B(M.tucsonMaint)}）。<br/>邀請 ${B("當場列保養項目")} 或 ${B("試算表")}。`,
    full: `不未查證即認同論壇金額。<br/>${M.forumMyth}；應依官方保養表＋當次工項報價。<br/>教材參考：8 萬公里累計定保約 ${M.maint8w}（低於 Tucson L 約 ${M.tucsonMaint}）。<br/>邀請當場列保養項目或試算表。`,
    score: "factCheck",
  });

  addQa({
    tags: [P, "保養", "累計定保", "P-01"],
    q: `「不要跟我說大概，保養費跟 CR-V、Tucson 比差多少？」`,
    blank: `比較要看 ${B("同里程累計定保")}，非單次網路謠言。<br/>${P} 8 萬公里教材約 ${B(M.maint8w)}；請客戶提供競品 ${B("同等級")} 保養表 ${B("並排對照")}。<br/>${B("不攻擊競品")}，用 ${B("工項透明")} 建立信任。`,
    full: `比較要看同里程累計定保，非單次網路謠言。<br/>${P} 8 萬公里教材約 ${M.maint8w}；請客戶提供競品同等等級保養表並排對照。<br/>不攻擊競品，用工項透明建立信任。`,
    score: "factCheck + 策略",
  });

  addQa({
    tags: [P, "SPORTAGE", "零件", "對戰"],
    q: `「我也在看 Sportage，零件跟保養會不會比你們省事？」`,
    blank: `承接比較動機；${P} 強調 ${B("國產保修據點")} 與 ${B("零件取得")}。<br/>Sportage 對戰看 ${B("產品週期")}、${B("長期持有成本")}，不人身攻擊。<br/>若客戶在意油電切換零件，引導看 ${B("累計定保")} 而非論壇單篇。<br/>${B("試乘")}＋${B("保養試算")}。`,
    full: `承接比較動機；${P} 強調國產保修據點與零件取得。<br/>Sportage 對戰看產品週期、長期持有成本，不人身攻擊。<br/>若客戶在意油電切換零件，引導看累計定保而非論壇單篇。<br/>試乘＋保養試算。`,
    score: "策略 + factCheck",
  });

  for (const p of PERSONAS) {
    const qs = {
      "P-01": `「${M.engine} 妥善率有官方數據嗎？跟自然進氣比呢？」`,
      "P-02": `「VC-TURBO 開起來會不會有頓挫？保養會不會很麻煩？」`,
      "P-03": `「論壇說一年保養 2～5 千，你們實際回廠要多少？」`,
      "P-04": `「引擎這麼新，我怕家人反對，有什麼資料可以帶回去？」`,
      "P-05": `「Ptt 說 VC-TURBO 妥善率有問題，你們怎麼回？」`,
    };
    addQa({
      tags: [P, "VC-TURBO", "保養", p.id, "人設專章"],
      q: qs[p.id],
      blank: `${p.focus}：${B("承接")}→${B(M.reliability)}→${B("保養表報價")}→${B("不認同論壇未載明工項")}→${B("試乘/試算")}。`,
      full: `${p.focus}：承接→${M.reliability}→保養表報價→不認同論壇未載明工項→試乘/試算。`,
      score: `人設 ${p.id}`,
    });
  }

  for (const d of DIFFICULTIES) {
    addQa({
      tags: [P, "VC-TURBO", d.label, "挑戰"],
      q: `【${d.label}】「你們 ${M.engine} 就是實驗品，妥善率差對吧？」`,
      blank: `${d.label}客戶：${B("不防禦不攻擊")}；說明 ${B("量產成熟")}＋${B("保固")}；${B(M.maint8w)} 累計定保參考；${B("邀請查保養手冊")}。`,
      full: `${d.label}客戶：不防禦不攻擊；說明量產成熟＋保固；${M.maint8w} 累計定保參考；邀請查保養手冊。`,
    });
  }

  addQa({
    tags: [P, "地雷", "論壇 2-5千"],
    q: `「對啊，論壇都說一年 2～5 千，你就說是這個價格吧。」（業代若順口認同…）`,
    blank: `【錯誤】${B("未查證即認同")} 論壇金額。<br/>正確：${B("依工項報價")}；${M.forumMyth}；給 ${B("累計定保參考")}。`,
    full: `【錯誤】未查證即認同論壇金額。正確：依工項報價；${M.forumMyth}；給累計定保參考。`,
    score: "factCheck 扣分",
  });
}

// ─── 執行產生 ───
addGuideQas();
generateVcTurboMaintenanceChapter();
for (const comp of XTRAIL_COMPETITORS) generateXtrailCompetitorChapter(comp);
generatePersonaCompetitorVariants();
generateAgeVariants();
generateKicksChapter();
generatePersonaChapter();
generateTrapQuestions();
generateTurnCountStrategies();
generateDynamicScenarioSims();

// 依章節分組輸出
/** @type {Map<string, QA[]>} */
const chapterMap = new Map();
chapterMap.set("guide", []);
chapterMap.set("xtrail", []);
chapterMap.set("kicks", []);
chapterMap.set("persona", []);
chapterMap.set("extra", []);
chapterMap.set("maint", []);

for (const qa of ALL_QAS) {
  if (qa.tags.includes("攻略") || qa.tags.includes("輪數")) {
    chapterMap.get("guide").push(qa);
  } else if (qa.tags.includes("VC-TURBO") || qa.tags.includes("保養") || qa.tags.includes("SPORTAGE")) {
    chapterMap.get("maint").push(qa);
  } else if (qa.tags.includes(KICKS.product)) {
    chapterMap.get("kicks").push(qa);
  } else if (qa.tags.some((t) => t.startsWith("P-")) && qa.tags.includes("人設專章")) {
    chapterMap.get("persona").push(qa);
  } else if (qa.tags.includes(XTRAIL.product)) {
    chapterMap.get("xtrail").push(qa);
  } else {
    chapterMap.get("extra").push(qa);
  }
}

const MATRIX_ROWS = XTRAIL_COMPETITORS.map((c) => [
  XTRAIL.product,
  c.competitor,
  c.issue,
  "P-01～P-05",
  `×${ALL_QAS.filter((q) => q.tags.includes(c.short)).length} 題`,
]).concat([[KICKS.product, "Honda HR-V", "促銷／月供", "P-03、P-04", `×${ALL_QAS.filter((q) => q.tags.includes(KICKS.product)).length} 題`]]);

function tagHtml(tags) {
  return tags
    .slice(0, 5)
    .map((t) => {
      let cls = "tag-dim";
      if (t.startsWith("P-")) cls = "tag-persona";
      else if (/R\d|開場|攻略/.test(t)) cls = "tag-scenario";
      return `<span class="tag ${cls}">${t}</span>`;
    })
    .join("");
}

function renderQa(qa) {
  return `
  <article class="qa" data-id="${qa.id}" data-tags="${qa.tags.join(",")}">
    <div class="qa-head"><span class="qa-num">${qa.id}</span>${tagHtml(qa.tags)}</div>
    <div class="qa-body">
      <p class="label label-q">客戶問</p><div class="block-q">${qa.q}</div>
      <p class="label label-a">挖空版回答</p><div class="block-a-blank">${qa.blank}</div>
      <p class="label label-full">完整詳解</p><div class="block-a-full">${qa.full}</div>
      ${qa.score ? `<p class="hint"><strong>評分重點：</strong>${qa.score}</p>` : ""}
    </div>
    <div class="qa-actions"><button type="button" class="btn toggle-full">顯示詳解</button></div>
  </article>`;
}

function renderChapter(id, title, meta, qas) {
  if (!qas.length) return "";
  return `<h2 id="${id}">${title} <span class="count">(${qas.length} 題)</span></h2><p class="meta">${meta}</p>${qas.map(renderQa).join("")}`;
}

const matrixRows = MATRIX_ROWS.map(
  (r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`,
).join("");

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>對練助手 · RAG QA 詳解（${ALL_QAS.length} 題）</title>
<style>
:root{--bg:#f8faf9;--card:#fff;--border:#d1e7dd;--text:#064e3b;--muted:#3d6b5c;--accent:#0d9488;--accent-light:#ecfdf5;--q-bg:#f0fdf4;--a-blank-bg:#fffbeb;--a-full-bg:#ecfdf5;--blank:#b45309;--blank-bg:#fef3c7}
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI","Microsoft JhengHei",sans-serif;background:var(--bg);color:var(--text);line-height:1.7;font-size:15px}
.wrap{max-width:960px;margin:0 auto;padding:1.5rem 1.25rem 4rem}
h1{font-size:1.55rem;margin:0 0 .35rem}h2{font-size:1.12rem;margin:2rem 0 .6rem;padding:.45rem .7rem;background:linear-gradient(90deg,#d1fae5,transparent);border-left:4px solid var(--accent)}
.count{font-size:.85rem;color:var(--muted);font-weight:normal}.meta{color:var(--muted);font-size:.85rem;margin-bottom:.75rem}
.toolbar{display:flex;flex-wrap:wrap;gap:.5rem;margin:1rem 0;position:sticky;top:0;z-index:10;background:var(--bg);padding:.5rem 0;border-bottom:1px solid var(--border)}
.btn{border:1px solid var(--border);background:var(--card);padding:.4rem .8rem;border-radius:8px;font-size:.85rem;cursor:pointer;font-family:inherit}
.btn-primary{background:var(--accent);color:#fff;border-color:var(--accent)}
.filter-bar{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:1rem}
.filter-btn{font-size:.75rem;padding:.2rem .5rem;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer}
.filter-btn.active{background:#d1fae5;border-color:#10b981}
.toc{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;margin-bottom:1rem}
.toc ol{columns:2;gap:1rem;margin:.5rem 0 0;padding-left:1.2rem}.toc a{color:var(--accent);text-decoration:none}
.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;margin-bottom:1rem}
.qa{background:var(--card);border:1px solid var(--border);border-radius:10px;margin-bottom:1rem;overflow:hidden}
.qa.hidden{display:none}.qa-head{display:flex;flex-wrap:wrap;gap:.35rem;padding:.55rem .85rem;background:var(--accent-light);border-bottom:1px solid var(--border);font-size:.78rem}
.qa-num{font-weight:700;color:var(--accent)}.tag{padding:.08rem .4rem;border-radius:4px;font-size:.7rem;font-weight:600}
.tag-scenario{background:#dbeafe;color:#1e40af}.tag-persona{background:#ede9fe;color:#5b21b6}.tag-dim{background:#fef3c7;color:#92400e}
.qa-body{padding:.85rem 1rem}.label{font-size:.72rem;font-weight:700;margin-bottom:.25rem}.label-q{color:#047857}.label-a{color:#b45309}.label-full{color:#0d9488}
.block-q{background:var(--q-bg);border-left:3px solid #10b981;padding:.65rem .85rem;margin-bottom:.75rem;border-radius:0 6px 6px 0}
.block-a-blank{background:var(--a-blank-bg);border-left:3px solid #f59e0b;padding:.65rem .85rem;margin-bottom:.6rem;border-radius:0 6px 6px 0}
.block-a-full{background:var(--a-full-bg);border-left:3px solid var(--accent);padding:.65rem .85rem;display:none;border-radius:0 6px 6px 0}
.block-a-full.visible{display:block}.blank{color:var(--blank);background:var(--blank-bg);padding:0 .2rem;border-bottom:2px dashed #f59e0b;font-weight:600}
.blank.revealed{color:#065f46;background:#d1fae5;border-bottom-color:transparent}
.qa-actions{padding:0 1rem .85rem}.hint{font-size:.78rem;color:var(--muted)}
.matrix-table,.facts-table{width:100%;border-collapse:collapse;font-size:.82rem}.matrix-table th,.matrix-table td,.facts-table th,.facts-table td{border:1px solid var(--border);padding:.4rem .5rem}
.matrix-table th{background:var(--accent-light)}.forbidden{color:#b91c1c}
@media(max-width:640px){.toc ol{columns:1}}
</style>
</head>
<body>
<div class="wrap">
<h1>對練助手 · RAG 知識 QA 詳解（高分攻略版）</h1>
<p class="meta">共 <strong id="totalCount">${ALL_QAS.length}</strong> 題 · 依車型×競品×人設×年齡×難度×輪次模擬 · 含挖空練習與完整話術</p>
<div class="toolbar">
<button type="button" class="btn btn-primary" id="expandAll">全部展開詳解</button>
<button type="button" class="btn" id="collapseAll">全部收合</button>
<button type="button" class="btn" id="revealBlanks">顯示所有挖空</button>
<input type="search" id="searchBox" placeholder="搜尋題目關鍵字…" style="flex:1;min-width:140px;padding:.4rem .6rem;border:1px solid var(--border);border-radius:8px"/>
</div>
<div class="filter-bar" id="filterBar">
<button type="button" class="filter-btn active" data-filter="all">全部</button>
<button type="button" class="filter-btn" data-filter="RAV4">RAV4</button>
<button type="button" class="filter-btn" data-filter="CR-V">CR-V</button>
<button type="button" class="filter-btn" data-filter="Tucson L">Tucson</button>
<button type="button" class="filter-btn" data-filter="Outlander">Outlander</button>
<button type="button" class="filter-btn" data-filter="Sportage">Sportage</button>
<button type="button" class="filter-btn" data-filter="VC-TURBO">VC-TURBO</button>
<button type="button" class="filter-btn" data-filter="保養">保養費</button>
<button type="button" class="filter-btn" data-filter="KICKS">KICKS</button>
<button type="button" class="filter-btn" data-filter="P-01">P-01</button>
<button type="button" class="filter-btn" data-filter="P-03">P-03</button>
<button type="button" class="filter-btn" data-filter="P-05">P-05</button>
<button type="button" class="filter-btn" data-filter="地雷">地雷題</button>
</div>
<nav class="toc card"><strong>目錄</strong><ol>
<li><a href="#guide">攻略與輪數（${chapterMap.get("guide").length}）</a></li>
<li><a href="#maint">VC-TURBO／保養／Sportage（${chapterMap.get("maint").length}）</a></li>
<li><a href="#xtrail">X-TRAIL 情境模擬（${chapterMap.get("xtrail").length}）</a></li>
<li><a href="#kicks">KICKS 情境模擬（${chapterMap.get("kicks").length}）</a></li>
<li><a href="#persona">人設專章（${chapterMap.get("persona").length}）</a></li>
<li><a href="#extra">地雷與補充（${chapterMap.get("extra").length}）</a></li>
</ol></nav>
<div class="card" id="matrix"><h3 style="margin-top:0">情境組合矩陣</h3>
<table class="matrix-table"><thead><tr><th>車型</th><th>競品</th><th>議題</th><th>人設</th><th>題數</th></tr></thead><tbody>${matrixRows}</tbody></table></div>
${renderChapter("guide", "第〇章　攻略、難度與輪數", "開練前必讀", chapterMap.get("guide"))}
${renderChapter("maint", "第〇章之二　VC-TURBO／妥善率／回廠費用／SPORTAGE", "對練高頻追問 · 論壇 2～5 千澄清 · 累計定保參考", chapterMap.get("maint"))}
${renderChapter("xtrail", "第一～五章　X-TRAIL ICE 情境模擬", "含 RAV4／CR-V／Tucson L／Outlander／Sportage · 標準六輪＋人設＋年齡＋動態組合", chapterMap.get("xtrail"))}
${renderChapter("kicks", "第五章　KICKS vs HR-V", "價格／促銷／都會用車", chapterMap.get("kicks"))}
${renderChapter("persona", "第六章　人設專章 P-01～P-05", "各人設典型追問與高分回應重心", chapterMap.get("persona"))}
${renderChapter("extra", "第七章　地雷題與補充", "禁止說法反向練習", chapterMap.get("extra"))}
<h2 id="appendix">附錄　禁止說法</h2>
<div class="card"><ul class="forbidden">
<li>攻擊競品品質 · 保證一定省油 · 憑空數字 · 未公布折扣 · 貶低客戶選擇</li>
</ul><p style="margin:.5rem 0 0"><strong>成交動作：</strong>試乘 · 油耗試算表 · 月供試算 · 二訪 · 保留名額</p></div>
<p class="meta">產生：${new Date().toISOString().slice(0, 10)} · node scripts/ops/generate-roleplay-rag-qa-drill.mjs</p>
</div>
<script>
document.querySelectorAll(".toggle-full").forEach(btn=>{btn.onclick=()=>{const f=btn.closest(".qa").querySelector(".block-a-full");const v=f.classList.toggle("visible");btn.textContent=v?"收合詳解":"顯示詳解";}});
document.getElementById("expandAll").onclick=()=>{document.querySelectorAll(".block-a-full").forEach(e=>e.classList.add("visible"));document.querySelectorAll(".toggle-full").forEach(b=>b.textContent="收合詳解");};
document.getElementById("collapseAll").onclick=()=>{document.querySelectorAll(".block-a-full").forEach(e=>e.classList.remove("visible"));document.querySelectorAll(".toggle-full").forEach(b=>b.textContent="顯示詳解");};
document.getElementById("revealBlanks").onclick=()=>{document.querySelectorAll(".blank").forEach(e=>{e.textContent=e.dataset.answer||"—";e.classList.add("revealed");});};
const searchBox=document.getElementById("searchBox");
searchBox.oninput=()=>{const q=searchBox.value.trim().toLowerCase();document.querySelectorAll(".qa").forEach(el=>{const t=el.textContent.toLowerCase();el.classList.toggle("hidden",q&&!t.includes(q));});};
document.querySelectorAll(".filter-btn").forEach(btn=>{btn.onclick=()=>{document.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active"));btn.classList.add("active");const f=btn.dataset.filter;document.querySelectorAll(".qa").forEach(el=>{if(f==="all"){el.classList.remove("hidden");return;}el.classList.toggle("hidden",!el.dataset.tags.includes(f));});};});
</script>
</body></html>`;

fs.writeFileSync(outPath, html, "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Total QAs: ${ALL_QAS.length}`);
console.log(`  guide: ${chapterMap.get("guide").length}`);
console.log(`  maint: ${chapterMap.get("maint").length}`);
console.log(`  xtrail: ${chapterMap.get("xtrail").length}`);
console.log(`  kicks: ${chapterMap.get("kicks").length}`);
console.log(`  persona: ${chapterMap.get("persona").length}`);
console.log(`  extra: ${chapterMap.get("extra").length}`);
