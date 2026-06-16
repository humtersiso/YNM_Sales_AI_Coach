import { isCostDetailQuery } from "@/lib/gemini/cost-query-expand";
import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { isDualChannelComparison } from "@/lib/gemini/retrieval-query-builder";
import {
  extractMentionedCompetitor,
  getHeroProduct,
  mentionsCompetitor,
  mentionsHeroProduct,
  type SalesQuestionProfile,
} from "@/lib/gemini/sales-question-profile";
import {
  DATA_AGENT_FORMAT_BULLET_MAX_CHARS,
  DATA_AGENT_FORMAT_MAX_BULLETS,
  DATA_AGENT_FORMAT_RAW_EXCERPT_CHARS,
  DATA_AGENT_FORMAT_SUMMARY_MAX_CHARS,
  SALES_REPLY_INTRO_MAX_CHARS,
  SALES_REPLY_LENGTH_HINT,
} from "@/lib/gemini/sales-reply-config";

/** 銷售助手：直接回答、避免 meta 套話（Data Agent / Gemini 摘要共用） */
export const SALES_DIRECT_REPLY_RULES = `回覆格式（必守）：
- 繁體中文，直接回答問題，禁止「這份摘要整理了」「以下整理」「可參考以下」「依知識庫」等開場套話
- 第一句：直接給結論（${SALES_REPLY_INTRO_MAX_CHARS}字內），例如「影片在…」「可這樣回客戶…」「AEB 差異在…」
- ${SALES_REPLY_LENGTH_HINT}；每點以事實或話術動作開頭（建議、可強調、重點、可回覆），保留關鍵數據或連結即可，避免長篇鋪陳
- 不要表格、SQL、英文標題、### 小標、**粗體**、markdown 列點符號（- 或 * 開頭）
- 只寫知識庫有的內容；與汽車銷售無關的問題請明說題庫無法回答，勿硬扯產品`;

/** 競品素材防禦：避免 Gemini 變成對手業務（Grounded / 摘要共用） */
export const SALES_COMPETITOR_DEFENSE_RULES = `【競品特色防禦性轉化規範（嚴格執行）】
1. 你的唯一身份是「裕隆日產汽車銷售培訓助理」。任務是協助 NISSAN 業代賣車，不是幫競品（如 XFORCE、TUCSON L、MUFASA、CR-V、Sportage）做廣告。
2. 知識庫若出現對手優點、配備或感性讚美（如：頭等享受、超乎想像、同級最寬敞、霸氣姿態、省油霸主），「絕對禁止」直接認同或以推銷口吻複製。
3. 必須將競品資訊轉化為「業代可發揮的抗衡點」或「攻防引導話術」：先中性一句帶過競品宣稱，再轉向本品可強調之處。
4. 列點（Bullets）語氣：
   - 嚴禁：「強調競品具備…」「推銷競品擁有…」「可強調 XFORCE 的…」「建議可強調競品…」等替競品背書的句型。
   - 必須：「提醒業代，競品主打…，可引導客戶對比本品 ○○ 擁有…」「若客戶提到…，可回覆…」等防守型對戰語氣。
5. 若片段僅有競品行銷、無本品對比，intro 應寫「可這樣轉化話術…」，勿當競品代言人。`;

/** 問句或分類涉及競品時注入防禦規範 */
export function shouldApplyCompetitorDefense(
  profile?: SalesQuestionProfile,
  message = "",
): boolean {
  const rival =
    profile?.mentionedCompetitor ??
    (message ? extractMentionedCompetitor(message) : null);
  if (profile?.category === "competitor") return true;
  if (!rival) return false;
  if (mentionsHeroProduct(message) && /比較|對比|vs|相較|對戰/i.test(message)) return true;
  return mentionsCompetitor(message) && !mentionsHeroProduct(message);
}

export function buildCompetitorDefenseRules(
  profile?: SalesQuestionProfile,
  message = "",
): string {
  if (!shouldApplyCompetitorDefense(profile, message)) return "";
  const rival =
    profile?.mentionedCompetitor ??
    (message ? extractMentionedCompetitor(message) : null);
  const hero = profile?.heroProduct.displayName ?? getHeroProduct().displayName;
  return `${SALES_COMPETITOR_DEFENSE_RULES}\n- 本品主力：${hero}${rival ? `；題庫競品／問句焦點：${rival}` : ""}`;
}

/** 要求 Data Agent 從 BQ 拉出可核對的具體內容（勿只回「有檔案／可試算」） */
export const SALES_DATA_AGENT_QUERY_RULES = `請查詢已連結的 BigQuery 知識庫，**以資料內容為主**回答。

必守：
- 寫出查詢結果中的**具體事實**：金額（元、萬元）、里程、年／公里週期、車款／等級、百分比、倍數、保養項目名稱
- 持有成本／保費／牌照稅／油耗／耗材／電池／輪胎等：若有試算或累計數字，**逐項列出實際金額與前提**（如「至 8 萬公里累計約 ○○ 元」）
- 競品對戰、配備、話術：保留原文關鍵句、頻道名、連結（可精簡 URL）
- **禁止**只回答「系統有專屬檔案」「可進行試算」「建議查詢」而沒有任何數字或原文摘錄
- **查無的項目不要寫**：沒有保費／牌照稅／燃料稅等數據時，**略過該項**，不要寫「未載明」「無資料」`;

/** 依問題分類追加 Data Agent 查詢指引 */
export function buildCategoryQueryRules(profile: SalesQuestionProfile): string {
  const hero = profile.heroProduct.displayName;
  const rival = profile.mentionedCompetitor;

  if (profile.category === "competitor") {
    const pair = rival ? `${rival} 與 ${hero}` : `競品與 ${hero}`;
    return `
【競品題】以 ${pair} **對比**回答（本品 ${hero} 為銷售主力）：
- 列出具體差額、金額、配備差異；勿只寫競品內部「油電 vs 汽油」版本比較
- 若知識庫有 ${hero} 同期數據，必須與競品並列`;
  }

  if (profile.category === "sales_qa") {
    return `
【QA 話術題】以業代現場可複誦的話術為主：
- 保留「建議／可強調／可回覆」用語與關鍵句
- 可含應對步驟，但須來自知識庫原文`;
  }

  return `
【本品題】以 ${hero} 配備、規格、優勢、數字為主：
- 列點寫配備名稱與具體數值或功能說明
- 若問句涉及競品，仍應以 ${hero} 為回答主體並標出差異`;
}

/** 依問題分類追加 Gemini 整理指引 */
export function buildCategoryFormatRules(profile: SalesQuestionProfile): string {
  const hero = profile.heroProduct.displayName;
  const rival = profile.mentionedCompetitor;

  if (profile.category === "competitor") {
    const label = rival ?? "競品";
    return `
【競品整理】
- 小結第一句必須寫「${label} vs ${hero}」的關鍵差異（含金額或配備差）；若問句只問競品特色，仍須點出可如何轉化話術對比 ${hero}
- 至少一列「競品比較：…」彙整差額；同車系油電/汽油內比只能放在其他列點，不可取代競品小結
- 摘錄有 ${hero} 數字而原文未寫者，必須納入
- 列點禁止替競品推銷；須用防守型對戰語氣（見競品防禦規範）`;
  }

  if (profile.category === "sales_qa") {
    return `
【QA 話術整理】
- 小結以「可這樣回客戶…」或直接給回應方向（一句）
- 列點以「建議／可強調／可回覆／重點」開頭，方便現場複誦
- 保留原文話術用語，勿改寫成分析報告語氣`;
  }

  return `
【本品整理】
- 小結直接講 ${hero} 的結論（配備有無、規格數字、優勢）
- 列點格式「配備或項目名：說明+數字」
- 不涉及競品時勿硬加對比`;
}

export function buildDataAgentUserPrompt(question: string, profile?: SalesQuestionProfile): string {
  const categoryBlock = profile ? buildCategoryQueryRules(profile) : "";
  return `請根據已連結的 BigQuery 知識庫回答。

${SALES_DIRECT_REPLY_RULES}
${SALES_DATA_AGENT_QUERY_RULES}
${categoryBlock}

問題：${question}`;
}

/** 送給 Data Agent 的提問（含分類與資料具體度要求） */
export function buildDataAgentRawPrompt(
  question: string,
  profile: SalesQuestionProfile,
): string {
  return `${SALES_DATA_AGENT_QUERY_RULES}
${buildCategoryQueryRules(profile)}

問題：${question.trim()}`;
}

function buildCitationContextBlock(citations: ScriptCitation[], profile: SalesQuestionProfile): string {
  if (citations.length === 0) return "";
  const hero = profile.heroProduct.displayName;
  const blocks = citations
    .slice(0, 8)
    .map((c) => `[摘錄${c.index}] ${c.question}\n${c.script.slice(0, 900)}`)
    .join("\n\n---\n\n");
  return `

知識庫檢索摘錄（與 Data Agent 原文併用；摘錄有而原文未寫的 ${hero} 或競品數字也要納入）：
${blocks}`;
}

/** Data Agent 原文 → 業代易讀版；以資料為主、保留數字 */
export const SALES_DATA_AGENT_FORMAT_RULES = `你是裕隆日產汽車銷售培訓助理。請把「Data Agent 依 BigQuery 知識庫產出的原文」整理成業代現場可讀、**以資料為主**的版本。

整理原則（必守）：
- **只能使用原文資訊**，不可新增、不可推測、不可改數字與車款名稱
- **優先保留所有具體數據**：金額、里程、週期、型號、百分比、比較差額；禁止把有數字的句子改寫成「有試算檔」「可分析」「系統內建」等空話
- **禁止空泛列點**：不得出現僅描述「有專屬檔案／可試算／建議查詢／可協助說明」而無任何數字或原文事實的句子
- 若原文有保養／保費／稅／油耗／輪胎／電池等項目，應**分項列點並寫出金額或區間**（原文有幾項就列幾項）
- **沒有資料的項目不要出現在 bullets**：禁止「原文未載明」「知識庫未載明」「無相關數據」等句子；寧可少列，不要列空項
- 刪除 SQL、表格標記、Insights、版權與「根據檢索…」套話；繁體中文；禁止 markdown
- 列點格式：每條「小標題：完整說明」，中文冒號「：」；小標題 2～12 字
- 列點 ${Math.min(4, DATA_AGENT_FORMAT_MAX_BULLETS)}～${DATA_AGENT_FORMAT_MAX_BULLETS} 條；每條內文約 60～${DATA_AGENT_FORMAT_BULLET_MAX_CHARS} 字，**含必要數字**
- **intro 必寫小結**（約 56～${DATA_AGENT_FORMAT_SUMMARY_MAX_CHARS} 字）：直接答題 + **至少一組原文數字**；禁止「以下整理」
- 小結是總覽，列點是分項展開，勿重複同一句`;

export function buildDataAgentFormatPrompt(
  userQuestion: string,
  agentRaw: string,
  citations: ScriptCitation[] = [],
  profile: SalesQuestionProfile,
): string {
  const excerpt =
    agentRaw.length > DATA_AGENT_FORMAT_RAW_EXCERPT_CHARS
      ? `${agentRaw.slice(0, DATA_AGENT_FORMAT_RAW_EXCERPT_CHARS)}\n…（以下略）`
      : agentRaw;

  return `${SALES_DATA_AGENT_FORMAT_RULES}
${buildCategoryFormatRules(profile)}

業務問題：${userQuestion}
問題分類：${profile.category}（後端用，勿寫入回覆）

Data Agent 原文：
"""
${excerpt}
"""${buildCitationContextBlock(citations, profile)}

輸出 JSON（勿加 markdown 程式碼區塊）：
{
  "intro": "小結：含關鍵數字或直接結論",
  "bullets": ["僅列入原文有具體金額或事實的項目，無資料者省略"]
}`;
}

/** hybrid / agent 模式 Gemini 摘要用的分類規則 */
export function buildSummarizeCategoryRules(profile: SalesQuestionProfile): string {
  return buildCategoryFormatRules(profile).replace(/【.*?整理】/g, "").trim();
}

/** Grounded 生成：雙車比較／持有成本須統整本品與競品片段 */
export function buildGroundedSynthesisRules(
  message: string,
  profile?: SalesQuestionProfile,
): string {
  if (!profile) return "";
  const hero = profile.heroProduct.displayName;
  const rival = profile.mentionedCompetitor ?? extractMentionedCompetitor(message);
  const lines: string[] = [];

  if (isDualChannelComparison(message, profile) && rival) {
    lines.push(
      `【雙車比較統整】問句同時涉及 ${hero} 與 ${rival}：`,
      `- 小結須寫兩車關鍵差異（含金額、油耗、保養週期或配備差），勿只寫單車`,
      `- 列點須分項對照（如保養費、油耗成本），有數字必須寫出；缺一方數據則只列有資料的一方`,
      `- 絕對禁止用其他競品（如問 CR-V 卻引用 RAV4 試算）的數據代替 ${rival}`,
      `- 若片段無 ${rival} 的保養／油耗／成本數據，小結明說知識庫無該車建檔，列點僅能寫 ${hero} 有依據的內容`,
      `- 語氣為業代對戰話術，勿替競品背書（見競品防禦規範）`,
    );
  }

  if (isCostDetailQuery(message)) {
    lines.push(
      `【持有成本統整】若片段有試算或累計金額：`,
      `- 逐項列出（定保、油耗、稅費、輪胎、電池等）並標里程或年數前提`,
      `- ${hero}${rival ? ` 與 ${rival}` : ""} 有差額須寫出差多少（元或萬元）`,
      `- 禁止只寫「有試算表」「項目架構」而無任何數字`,
      `- 片段完全無金額時勿捏造，應明說知識庫無法依建檔資料回答`,
    );
  }

  return lines.length > 0 ? lines.join("\n") : "";
}
