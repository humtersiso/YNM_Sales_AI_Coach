import { geminiGenerateText } from "@/lib/gemini/gemini-client";
import { ROLEPLAY_COMPETITORS_XTRAIL } from "@/lib/roleplay/catalog";
import {
  buildConcreteCorrectGuide,
  filterFactsForSession,
  getOtherCompetitorMentions,
  hasConcreteNumbers,
  isVagueCorrectGuide,
  hasNonTaiwanCarTerms,
  isWrongCompetitorInGuide,
  normalizeCompetitorToken,
} from "@/lib/roleplay/engine/correction-guide";
import { normalizeCorrectionPoint } from "@/lib/roleplay/engine/correction-utils";
import { coalesceAdjacentAgentTurns } from "@/lib/roleplay/engine/turn-coalesce";
import type { RoleplayScenario } from "@/lib/roleplay/scenario-contract";
import type {
  RoleplayChatTurn,
  RoleplayCorrectionCategory,
  RoleplayCorrectionPoint,
} from "@/lib/roleplay/session-types";

function cleanFactExcerpt(value: string): string {
  return value
    .replace(/Do not use without any permission[\s\S]*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGarbageIssue(issue: string): boolean {
  const t = issue.trim();
  if (t.length < 6) return true;
  if (/^(重點\s*\d|舊世代|DLR|興趣車|Do not use)/i.test(t)) return true;
  return false;
}

function isRawRagDump(guide: string): boolean {
  const t = guide.trim();
  return (
    /重點\s*\d|舊世代\s*HEV|vs\.\s*重點|不買.*三大理由|請對照銷售助手/.test(t) ||
    (t.match(/・/g)?.length ?? 0) > 4 ||
    t.length > 320
  );
}

/** 主觀、非實質錯誤的「慣老闆」式 issue，應剔除 */
function isSubjectiveIssue(issue: string): boolean {
  if (/錯字|錯別字|打字|筆誤|同音|誤植|typo|用字|口條|流暢/.test(issue)) return true;
  return /語氣|熱情|更積極|關心|禮貌|態度|親切|微笑|寒暄|可以更|建議多/.test(
    issue,
  );
}

/** 剝除 Markdown 包裝與前言，供 JSON.parse */
export function parseLlmJsonResponse(raw: string): unknown {
  let t = raw.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (fence) t = fence[1]!.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

function formatNumberedTranscript(turns: RoleplayChatTurn[]): string {
  const paired = coalesceAdjacentAgentTurns(turns);
  const lines: string[] = [];
  let round = 0;
  for (let i = 0; i < paired.length; i++) {
    const t = paired[i]!;
    if (t.role === "agent") round += 1;
    const label = t.role === "customer" ? "客戶" : `業代（第 ${round} 輪）`;
    lines.push(`${label}：${t.content}`);
  }
  return lines.join("\n");
}

function forbiddenCompetitorNames(sessionCompetitor: string): string {
  return ROLEPLAY_COMPETITORS_XTRAIL.filter((c) => c !== sessionCompetitor).join("、");
}

type RubricPayload = {
  correctionPoints?: {
    issue?: string;
    category?: string;
    customerAsk?: string;
    whatYouSaid?: string;
    correctGuide?: string;
    roundHint?: string;
  }[];
};

function inferTopicFromIssue(issue: string, customerAsk?: string): string {
  if (/比錯|競品不符|車款|RAV4|CR-V|一直拿/.test(issue + (customerAsk ?? ""))) {
    return "competitor";
  }
  if (/保養|回廠|妥善|維修|引擎|VC-TURBO|自然進氣/.test(issue + (customerAsk ?? ""))) {
    return "maintenance";
  }
  if (/LINE|延後|試算|當場/.test(issue)) return "strategy_defer";
  if (/收尾|邀約|試乘/.test(issue)) return "advance";
  if (/油耗|成本|試算|稅金/.test(issue + (customerAsk ?? ""))) return "fuel";
  return "competitor";
}

function fallbackGuideForPoint(
  scenario: RoleplayScenario,
  issue: string,
  customerAsk?: string,
  category?: RoleplayCorrectionCategory,
): string {
  const topic = inferTopicFromIssue(issue, customerAsk);
  const shortComp = normalizeCompetitorToken(scenario.sectionA.competitor);

  if (topic === "competitor" || /比錯|一直拿|車款不符/.test(issue)) {
    const g = buildConcreteCorrectGuide(scenario, "competitor", customerAsk);
    if (g) return g;
    return `您要比的是 ${shortComp}，請立刻切換至 ${shortComp} 知識庫回應，勿再引用其他競品數據。`;
  }
  if (topic === "maintenance") {
    const g = buildConcreteCorrectGuide(scenario, "maintenance", customerAsk);
    if (g) return g;
    return `針對您一年約 2 萬公里的使用頻率，X-TRAIL 單次回廠定保約 2～5 千元，請用 ${shortComp} 與本車的保養試算當場說明。`;
  }
  if (topic === "strategy_defer" || (category === "strategy" && /LINE|延後/.test(issue))) {
    const g = buildConcreteCorrectGuide(scenario, "fuel", customerAsk);
    if (g && hasConcreteNumbers(g)) return g;
    return `我現在就用十年 10 萬公里試算表，把車價、稅金、油資與 ${shortComp} 的保養逐項加總給您看，不用延後到 LINE。`;
  }
  if (topic === "advance") {
    return buildConcreteCorrectGuide(scenario, "advance", customerAsk);
  }
  return buildConcreteCorrectGuide(scenario, "fuel", customerAsk) || `請針對 ${shortComp} 補充具體數字後回應。`;
}

function validateGuide(
  guide: string,
  scenario: RoleplayScenario,
  customerAsk: string | undefined,
  issue: string,
  category: RoleplayCorrectionCategory,
): string {
  const sessionComp = scenario.sectionA.competitor;
  const ok =
    guide.length >= 16 &&
    !isRawRagDump(guide) &&
    !isVagueCorrectGuide(guide) &&
    !isGarbageIssue(guide) &&
    !hasNonTaiwanCarTerms(guide) &&
    !isWrongCompetitorInGuide(guide, sessionComp, customerAsk) &&
    (category === "strategy" || hasConcreteNumbers(guide) || /competitor|比錯|車款/.test(issue));

  if (ok) return guide;
  return fallbackGuideForPoint(scenario, issue, customerAsk, category);
}

/** 去除 issue 或 correctGuide 高度重複的項目 */
export function dedupeCorrectionPoints(
  points: RoleplayCorrectionPoint[],
): RoleplayCorrectionPoint[] {
  const out: RoleplayCorrectionPoint[] = [];
  const seenIssue = new Set<string>();
  const seenGuide = new Set<string>();

  for (const p of points) {
    const issueKey = p.issue.replace(/\s+/g, "").slice(0, 28);
    const guideKey = p.correctGuide.replace(/\s+/g, "").slice(0, 72);
    if (seenIssue.has(issueKey) || seenGuide.has(guideKey)) continue;
    seenIssue.add(issueKey);
    seenGuide.add(guideKey);
    out.push(p);
  }
  return out;
}

/**
 * 外軌：將完整對話 + 本場競品專用 RAG 交給 Gemini，依結構化 Rubric 產出待加強。
 */
export async function buildCorrectionsViaRubricReview(
  scenario: RoleplayScenario,
  turns: RoleplayChatTurn[],
): Promise<RoleplayCorrectionPoint[]> {
  const sessionComp = scenario.sectionA.competitor;
  const shortComp = normalizeCompetitorToken(sessionComp);
  const product = scenario.sectionA.productDisplayName || "X-TRAIL";
  const forbidden = forbiddenCompetitorNames(sessionComp);
  const filteredFacts = filterFactsForSession(scenario.sectionC.facts, sessionComp);
  const factsBlock = filteredFacts
    .slice(0, 10)
    .map((f) => `- ${f.label}：${cleanFactExcerpt(f.value).slice(0, 240)}`)
    .join("\n");

  const transcript = formatNumberedTranscript(turns);

  const prompt = `你是資深汽車營業所長，審查以下業代與客戶的完整對練對話，產出「本場待加強」修正點。

【本場對話設定 — 系統已指定，勿從對話自行推測】
- 我方車款（本品）：${product}
- 目標競品（客戶首選對手，全名）：${sessionComp}
- 目標競品簡稱（shortComp，下文凡寫此簡稱即指 ${sessionComp}）：${shortComp}
- 本場唯一比較對象即 ${shortComp}；禁止在 correctGuide 中出現其他競品：${forbidden}（除非客戶原話有提到該車作為對照）

【嚴格無罪推定 — 必守】
- 嚴禁將「業代語氣可以更熱情」「建議多加關心」等主觀、非實質錯誤的流於形式建議列入。
- **打字錯字、同音錯字、語音輸入誤植不列入待加強**；以語意是否答到客戶問題為準。
- **部分給分**：該輪有嘗試回答、有部分正確內容，即使不完整也**勿列**待加強；僅列明顯答非所問、完全未回應、或與 RAG 明顯矛盾者。
- 只有在發生「事實錯誤（如看錯車款／算錯數字／答非所問）」或「違反既定銷售策略（如客戶要求試算卻只延後到 LINE、未當場說明）」時，才可判定為待加強。
- 若業代已充分回答且無上述失誤，correctionPoints 必須回傳空陣列 []，不可為湊數硬挑毛病。

【審查清單 — 請逐項檢查並反映在 correctionPoints】
1. 車型一致性：客戶若提及 ${shortComp}，業代是否在下一輪內切換至 ${shortComp} 知識？若持續講其他車（如 RAV4）→ 必列一項，issue 須寫明「比錯競品／未對準 ${shortComp}」
2. 答所問：客戶問保養／回廠／高里程預算時，業代是否給定保金額或頻率？若改講無關稅金或其他車款 → 必列
3. 策略執行：客戶要求當場試算或具體數字時，業代是否只延後到 LINE／內部確認？→ 列為 strategy
4. 內容重複：相同賣點（雙層玻璃、稅金、TNCAP）是否連續多輪重複而未回應客戶新問題？→ 合併為一項「避重就輕／重複話術」
5. 收尾：客戶已表示失望或要離開時，業代是否仍空泛邀約而未先回應疑慮？→ 最多列一項

【教材 — 僅能引用以下內容撰寫 correctGuide，禁止貼「重點 N」原文】
${factsBlock || "（無額外教材，請用口語＋合理試算邏輯）"}

【完整對話】
${transcript}

【輸出要求】
- 請直接輸出 JSON 字串，嚴禁包含任何 Markdown 標記（如 \`\`\`json）、前言或後記；確保回傳內容可直接被系統 JSON.parse()。
- 格式：{ "correctionPoints": [ ... ] }
- 列 0～5 項；僅列有明確事實或策略失誤者，無失誤則 correctionPoints: []
- 每項欄位：issue（標題）、category（fact 或 strategy）、customerAsk（客戶原話摘要）、whatYouSaid（業代原話摘要）、correctGuide（2～4 句口語，業代可直接對客戶重答；須含具體數字；必須針對 ${shortComp}）
- correctGuide 必須完全符合台灣汽車業代日常口語習慣（例如：使用「保養、規格配備、CP值、交車、回廠定保」；嚴禁出現「售後、配置、性價比、提車、保養週期」等非台灣本土用語）
- correctGuide 禁止：PDF 標題、重點 1/2/3/4、依教材、請參考 RAG、只寫試乘邀約而忽略客戶問題
- 相同建議話術不可重複出現兩次
- 客戶問保養而業代講錯車款時，correctGuide 應先糾正比較對象再給保養數字`;

  const raw = await geminiGenerateText(prompt, {
    json: true,
    maxOutputTokens: 2000,
    temperature: 0.2,
  });

  if (!raw) return [];

  try {
    const parsed = parseLlmJsonResponse(raw) as RubricPayload;
    if (!Array.isArray(parsed.correctionPoints)) return [];

    const points = parsed.correctionPoints
      .map((row) => {
        const issue = String(row.issue ?? "").trim();
        if (isSubjectiveIssue(issue)) return null;
        const category: RoleplayCorrectionCategory =
          row.category === "strategy" ? "strategy" : "fact";
        const customerAsk = String(row.customerAsk ?? "").trim() || undefined;
        const whatYouSaid = String(row.whatYouSaid ?? "").trim() || undefined;
        let guide = String(row.correctGuide ?? "").trim();
        guide = validateGuide(guide, scenario, customerAsk, issue, category);

        return normalizeCorrectionPoint({
          issue,
          category,
          customerAsk,
          whatYouSaid,
          correctGuide: guide,
        });
      })
      .filter((p): p is RoleplayCorrectionPoint => p !== null)
      .filter(
        (p) =>
          p.issue.length >= 6 &&
          p.correctGuide.length >= 12 &&
          !isGarbageIssue(p.issue) &&
          !isSubjectiveIssue(p.issue) &&
          !isRawRagDump(p.correctGuide) &&
          !isVagueCorrectGuide(p.correctGuide) &&
          !hasNonTaiwanCarTerms(p.correctGuide),
      );

    return dedupeCorrectionPoints(points).slice(0, 5);
  } catch {
    return [];
  }
}

export type CoachAlertPayload = {
  message: string;
  severity: "hint" | "warning";
  suggestion: string;
};

/** 內軌：客戶已強調本場競品時，提示業代下一輪勿提其他車款 */
export function buildLiveCoachAlert(
  turns: RoleplayChatTurn[],
  sessionCompetitor: string,
): CoachAlertPayload | null {
  const paired = coalesceAdjacentAgentTurns(turns);
  const lastCustomer = [...paired].reverse().find((t) => t.role === "customer");
  if (!lastCustomer) return null;

  const shortComp = normalizeCompetitorToken(sessionCompetitor);
  const c = lastCustomer.content;
  const severe =
    /比錯|怎麼一直|一直拿|我問的是|首選對手|都在講|跳開|避重就輕/i.test(c);
  const needsAlert =
    severe ||
    /比較.*CR-V|比較.*RAV4/i.test(c) ||
    (new RegExp(shortComp.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i").test(c) &&
      /不是|怎麼|為什麼/.test(c));

  if (!needsAlert) return null;

  const others = getOtherCompetitorMentions(
    paired
      .filter((t) => t.role === "agent")
      .map((t) => t.content)
      .join("\n"),
    sessionCompetitor,
  )
    .map(normalizeCompetitorToken)
    .filter((n) => n !== shortComp);

  const forbid = others.length > 0 ? others.join("、") : "其他競品";
  const severity: CoachAlertPayload["severity"] = severe || others.length > 0 ? "warning" : "hint";
  const message =
    severity === "warning"
      ? `注意：客戶要比的是 ${shortComp}，請勿再提 ${forbid}，並直接回應客戶剛才的問題。`
      : `提示：客戶目前非常在意與 ${shortComp} 的比較，請集中火力回應其疑慮。`;

  return {
    message,
    severity,
    suggestion: `建議方向：先承接客戶疑慮，再用 ${shortComp} 與本品的具體數字（油耗、定保、試算）逐項對照，勿偏題。`,
  };
}
