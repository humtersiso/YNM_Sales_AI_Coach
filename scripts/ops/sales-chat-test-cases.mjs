/**
 * 銷售助手驗證案例（本機 test-rag-grounded:log 與 Cloud Run 測試共用）
 * guard 類預期 inQuestionBank=false；其餘為 true
 */
export const SALES_CHAT_TEST_CASES = [
  { id: "reg-01", category: "regression", question: "TUCSON L 長期持有成本", expectBank: true },
  {
    id: "reg-02",
    category: "regression",
    question: "我試乘時候，好像會聽到異音 這是怎麼回事",
    expectBank: true,
  },
  { id: "reg-03", category: "regression", question: "XFORCE的特色", expectBank: true },
  { id: "reg-04", category: "regression", question: "XFORCE 跟 X-TRAIL 比較", expectBank: true },
  { id: "reg-05", category: "regression", question: "X-TRAIL 有哪些特色？說來聽聽", expectBank: true },
  { id: "spec-01", category: "spec", question: "馬力如何", expectBank: true },
  { id: "spec-02", category: "spec", question: "X-TRAIL ICE 的馬力如何？", expectBank: true },
  { id: "spec-03", category: "spec", question: "X-TRAIL 最大扭力多少？", expectBank: true },
  { id: "spec-04", category: "spec", question: "X-TRAIL ICE 油耗大概多少？", expectBank: true },
  { id: "comp-01", category: "competitor", question: "MUFASA 比較如何", expectBank: true },
  {
    id: "qa-01",
    category: "sales_qa",
    question: "為什麼你們X-TRAIL試乘起來後座都感覺很晃啊?",
    expectBank: true,
  },
  {
    id: "qa-02",
    category: "sales_qa",
    question: "網路上都說這台車用的三缸引擎抖動很嚴重，到底能不能買？",
    expectBank: true,
  },
  {
    id: "qa-03",
    category: "sales_qa",
    question: "聽說 X-TRAIL 輕油電的冷氣在夏天很不冷，是真的嗎？",
    expectBank: true,
  },
  {
    id: "reg-06",
    category: "regression",
    question: "KICKS 跟 X-TRAIL 都有輕油電，配備差在哪裡？",
    expectBank: true,
  },
  {
    id: "reg-07",
    category: "regression",
    question: "幫我推薦一台百萬左右、安全配備最滿的 NISSAN 休旅車。",
    expectBank: true,
  },
  { id: "cost-01", category: "cost", question: "TUCSON L 長期持有成本詳細數字是？", expectBank: true },
  {
    id: "cost-02",
    category: "cost",
    question: "現在這個月買 X-TRAIL 有什麼限時優惠或好禮？",
    expectBank: true,
  },
  {
    id: "cost-03",
    category: "cost",
    question: "旗艦版如果搭配舊換新折 5 萬，開走價是多少？",
    expectBank: true,
  },
  { id: "guard-01", category: "guard", question: "UFO 01 跟 X-TRAIL 差在哪", expectBank: false },
  {
    id: "guard-02",
    category: "guard",
    question: "法拉利 SF90 跟 X-TRAIL 比怎麼回",
    expectBank: false,
  },
];
