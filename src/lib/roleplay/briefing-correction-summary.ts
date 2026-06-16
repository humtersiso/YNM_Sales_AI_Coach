import type { RoleplayCompletedDetail } from "@/lib/bq/roleplay-sessions-bq";
import { inferCorrectionCategory } from "@/lib/roleplay/engine/correction-utils";
import { isGarbageIssue, isRawRagDump } from "@/lib/roleplay/engine/correction-builder";
import {
  filterFactsForSession,
  hasNonTaiwanCarTerms,
  isVagueCorrectGuide,
  normalizeCompetitorToken,
} from "@/lib/roleplay/engine/correction-guide";
import type { RoleplayCorrectionPoint } from "@/lib/roleplay/session-types";
import { filterDisplayCorrectionPoints } from "@/lib/roleplay/roleplay-session-detail";

export const BRIEFING_LAST_N_SESSIONS = 5;

/** 近 N 場完賽（新→舊） */
export function takeRecentCompletedSessions(
  sessions: RoleplayCompletedDetail[],
  n = BRIEFING_LAST_N_SESSIONS,
): RoleplayCompletedDetail[] {
  return [...sessions]
    .filter((s) => s.status === "COMPLETED" && s.finishedAt)
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))
    .slice(0, n);
}

function parseCorrectionPointsFromReport(
  reportJson: string | null | undefined,
): RoleplayCorrectionPoint[] {
  if (!reportJson?.trim()) return [];
  try {
    const j = JSON.parse(reportJson) as {
      correctionPoints?: Partial<RoleplayCorrectionPoint>[];
    };
    if (!Array.isArray(j.correctionPoints)) return [];
    return j.correctionPoints
      .map((p) => ({
        issue: String(p.issue ?? "").trim(),
        category:
          p.category === "fact" || p.category === "strategy"
            ? p.category
            : inferCorrectionCategory(String(p.issue ?? "")),
        customerAsk: String(p.customerAsk ?? "").trim() || undefined,
        whatYouSaid: String(p.whatYouSaid ?? "").trim() || undefined,
        correctGuide: String(p.correctGuide ?? "").trim(),
      }))
      .filter((p) => p.issue && p.correctGuide);
  } catch {
    return [];
  }
}

export function correctionPointsFromDetail(d: RoleplayCompletedDetail): RoleplayCorrectionPoint[] {
  const raw = d.correctionPoints?.length
    ? d.correctionPoints
    : parseCorrectionPointsFromReport(d.reportJson);
  return filterDisplayCorrectionPoints(raw);
}

/** 小結／記憶用：保留 issue 有效的待加強，即使 correctGuide 為 RAG 片段（可改從 scenarioFacts 取數字） */
function correctionPointsForBriefing(d: RoleplayCompletedDetail): RoleplayCorrectionPoint[] {
  const raw = d.correctionPoints?.length
    ? d.correctionPoints
    : parseCorrectionPointsFromReport(d.reportJson);
  return raw.filter((p) => !isGarbageIssue(p.issue) && p.issue.trim().length >= 4);
}

/** 從 report_json 解析情境佐證事實 */
export function parseScenarioFactsFromReport(
  reportJson: string | null | undefined,
): { label: string; value: string }[] {
  if (!reportJson?.trim()) return [];
  try {
    const j = JSON.parse(reportJson) as {
      scenarioFacts?: { label?: string; value?: string }[];
    };
    if (!Array.isArray(j.scenarioFacts)) return [];
    return j.scenarioFacts
      .map((f) => ({
        label: String(f.label ?? "").trim(),
        value: String(f.value ?? "").trim(),
      }))
      .filter((f) => f.label || f.value);
  } catch {
    return [];
  }
}

const MEANINGFUL_NUM_RE =
  /\d{3,}[\d,.]*|\d[\d,.]*\s*(?:萬|元|千|公里|km\/L|km|分貝|%|年)|\d[\d,.]*[～~-]\s*\d/;

function hasMeaningfulNumbers(text: string): boolean {
  return MEANINGFUL_NUM_RE.test(text);
}

/** 首頁記憶重點／knowledgeLines 品質門檻（供 Gemini 解析共用） */
export function isValidFactMemoryLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 10) return false;
  if (/請對照|依教材|重點\s*\d|舊世代\s*HEV|vs\.\s*重點/i.test(t)) return false;
  if (isRawRagDump(t) || isVagueCorrectGuide(t) || hasNonTaiwanCarTerms(t)) return false;
  if (!hasMeaningfulNumbers(t)) return false;
  if (/[：:]\s*\d{1,2}(、\d{1,2})+/.test(t) && !/(元|千|萬|公里|km)/i.test(t)) return false;
  return true;
}

function topicHintFromIssue(issue: string): RegExp {
  if (/定保|保養|回廠/.test(issue)) return /定保|保養|回廠|維修|零件|元|千|萬/;
  if (/油耗|WLTC|油費|油資/.test(issue)) return /油耗|WLTC|油費|油資|km\/L|萬|公里/;
  if (/隔音|分貝|玻璃/.test(issue)) return /隔音|分貝|玻璃/;
  if (/零件|維修|引擎|CVT|電池/.test(issue)) return /零件|維修|引擎|CVT|電池|耐用/;
  return /./;
}

function pickNumericSentences(text: string, topicRe: RegExp): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/[。！？\n；]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
    .filter((s) => !/重點\s*\d|請對照|依教材/i.test(s))
    .filter((s) => hasMeaningfulNumbers(s))
    .filter((s) => topicRe.test(s));
}

function formatMemoryLine(sentence: string): string {
  let line = sentence.trim();
  if (!/^須牢記/.test(line)) {
    line = `須牢記：${line}`;
  }
  if (!/[。！？]$/.test(line)) line += "。";
  if (line.length > 80) line = `${line.slice(0, 78)}…`;
  return line;
}

function scenarioFactsForSession(s: RoleplayCompletedDetail): { label: string; value: string }[] {
  if (s.scenarioFacts?.length) return s.scenarioFacts;
  return parseScenarioFactsFromReport(s.reportJson);
}

function extractExamFactLine(
  guide: string,
  issue: string,
  competitor: string,
  scenarioFacts: { label: string; value: string }[] = [],
  customerAsk?: string,
): string {
  const shortComp = normalizeCompetitorToken(competitor);
  const topicRe = topicHintFromIssue(`${issue} ${guide}`);

  if (guide.trim() && !isRawRagDump(guide) && !isVagueCorrectGuide(guide)) {
    const fromGuide = pickNumericSentences(guide, topicRe);
    if (fromGuide.length > 0) {
      const best = fromGuide[0];
      const withContext =
        /CR-V|RAV4|Tucson|Sportage|X-TRAIL|竞品|競品/i.test(best) || best.includes(shortComp)
          ? best
          : `${shortComp}：${best}`;
      const formatted = formatMemoryLine(withContext);
      if (isValidFactMemoryLine(formatted)) return formatted;
    }
  }

  const filtered = filterFactsForSession(scenarioFacts, competitor, customerAsk);
  for (const f of filtered) {
    const text = `${f.label} ${f.value}`.trim();
    if (/重點\s*\d|舊世代\s*HEV|Do not use/i.test(text)) continue;
    for (const s of pickNumericSentences(text, topicRe)) {
      const formatted = formatMemoryLine(s);
      if (isValidFactMemoryLine(formatted)) return formatted;
    }
  }

  return "";
}

function simplifyStrategyLine(guide: string, issue: string): string {
  const g = guide.trim();
  if (/延後到試乘|當場說明/.test(issue)) {
    return "客戶要試算邏輯時，應當場說明成本結構，勿只說試乘才給表";
  }
  if (/敷衍|未先回應/.test(issue)) {
    return "邀約試乘前須先回應客戶疑慮，語氣要專業具體";
  }
  if (/試乘|試駕/.test(g + issue)) {
    return "收尾可主動邀約試乘，並約定具體日期與時段";
  }
  if (/試算|成本表|十年/.test(g + issue)) {
    return "主動提供十年用車成本試算表，當場對數字";
  }
  if (/邀約|預約|來店/.test(g + issue)) {
    return "結束對話前具體邀約下一步（試乘或試算）";
  }
  return g.length > 60 ? `${g.slice(0, 58)}…` : g;
}

const MEMORY_CATEGORY_TAG = {
  fact: "資訊對錯",
  strategy: "銷售策略",
} as const;

/** 記憶重點列點品質（僅資訊對錯、須含金額／油耗等數字） */
export function isValidCorrectionMemoryLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 10 || t.length > 100) return false;
  if (/請對照|依教材|重點\s*\d/i.test(t)) return false;
  if (isRawRagDump(t) || hasNonTaiwanCarTerms(t)) return false;
  if (t.startsWith(`【${MEMORY_CATEGORY_TAG.strategy}】`)) return false;

  const body = t.startsWith(`【${MEMORY_CATEGORY_TAG.fact}】`)
    ? t.slice(`【${MEMORY_CATEGORY_TAG.fact}】`.length)
    : t;
  if (!hasMeaningfulNumbers(body)) return false;
  return isValidFactMemoryLine(body) || isValidFactMemoryLine(`須牢記：${body}`);
}

/** 從單筆待加強抽出記憶重點列點（fact／strategy 皆可，須含合格數字） */
function memoryLineFromCorrection(
  p: RoleplayCorrectionPoint,
  session: RoleplayCompletedDetail,
  scenarioFacts: { label: string; value: string }[],
): string | null {
  const tag = MEMORY_CATEGORY_TAG.fact;
  const detail = extractExamFactLine(
    p.correctGuide,
    p.issue,
    session.competitor,
    scenarioFacts,
    p.customerAsk,
  );
  if (detail && isValidFactMemoryLine(detail)) {
    return `【${tag}】${detail.replace(/^須牢記：?/, "")}`;
  }
  if (
    p.issue.trim().length >= 4 &&
    p.correctGuide?.trim() &&
    !isRawRagDump(p.correctGuide) &&
    !isVagueCorrectGuide(p.correctGuide) &&
    hasMeaningfulNumbers(p.correctGuide)
  ) {
    const guide = p.correctGuide.replace(/\s+/g, " ").trim();
    const short = guide.length > 52 ? `${guide.slice(0, 50)}…` : guide;
    return `【${tag}】${p.issue.trim()}：${short}`;
  }
  return null;
}

function finalizeMemoryLine(line: string): string {
  let out = line;
  if (!/[。！？]$/.test(out)) out += "。";
  if (out.length > 96) out = `${out.slice(0, 94)}…`;
  return out;
}

/**
 * 記憶重點：近 N 場待加強中須記住的數字（金額、油耗等）。
 * 資訊對錯全收；銷售策略僅抽出 correctGuide 內的合格數字，策略描述仍見 buildStrategyAdviceFromCorrections。
 */
export function buildCorrectionMemoryLinesFromCorrections(
  sessions: RoleplayCompletedDetail[],
): string[] {
  const recent = takeRecentCompletedSessions(sessions);
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const s of recent) {
    const facts = scenarioFactsForSession(s);
    for (const p of correctionPointsForBriefing(s)) {
      const raw = memoryLineFromCorrection(p, s, facts);
      if (!raw) continue;

      const line = finalizeMemoryLine(raw);
      const dedupeKey = line.replace(/^【資訊對錯】/, "").slice(0, 36);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      if (isValidCorrectionMemoryLine(line)) lines.push(line);
      if (lines.length >= 12) return lines;
    }
  }
  return lines;
}

/**
 * 記憶重點（僅資訊對錯、含數字）：供 Gemini 素材與舊版 fallback。
 * 無合格資料回傳 []（UI 顯示「無」）。
 */
export function buildFactMemoryLinesFromCorrections(
  sessions: RoleplayCompletedDetail[],
): string[] {
  const recent = takeRecentCompletedSessions(sessions);
  const issueCount = new Map<string, { line: string; count: number }>();
  const seenGuide = new Set<string>();

  for (const s of recent) {
    const facts = scenarioFactsForSession(s);
    for (const p of correctionPointsForBriefing(s)) {
      if (!p.correctGuide?.trim() && facts.length === 0) continue;

      const extracted = memoryLineFromCorrection(p, s, facts);
      if (!extracted) continue;

      const body = extracted.replace(/^【資訊對錯】/, "").trim();
      const line = formatMemoryLine(body);
      if (!isValidFactMemoryLine(line)) continue;

      const key = line.slice(0, 32);
      if (seenGuide.has(key)) {
        const prev = issueCount.get(key);
        if (prev) prev.count += 1;
        continue;
      }
      seenGuide.add(key);
      issueCount.set(key, { line, count: 1 });
    }
  }

  const sorted = [...issueCount.values()].sort((a, b) => b.count - a.count);
  return sorted.slice(0, 3).map(({ line, count }) => {
    if (count >= 2) {
      return `${line.replace(/。$/, "")}（近${recent.length}場中曾${count}次待加強）。`;
    }
    return line;
  });
}

function formatStrategyAdviceItem(issue: string, tip: string): string {
  const issueTrim = issue.trim();
  if (issueTrim.length < 4) return tip;
  const issueShort = issueTrim.length > 40 ? `${issueTrim.slice(0, 38)}…` : issueTrim;
  return `${issueShort}：${tip}`;
}

/**
 * 建議：彙整近 N 場「銷售策略」待加強（描述性行為建議，不含須記數字）。
 * 無資料回傳「無」。
 */
export function buildStrategyAdviceFromCorrections(
  sessions: RoleplayCompletedDetail[],
): string {
  const recent = takeRecentCompletedSessions(sessions);
  const items: string[] = [];
  const seen = new Set<string>();

  for (const s of recent) {
    for (const p of correctionPointsForBriefing(s)) {
      const cat = p.category ?? inferCorrectionCategory(p.issue);
      if (cat !== "strategy") continue;
      const tip = simplifyStrategyLine(p.correctGuide, p.issue);
      if (!tip) continue;
      const key = p.issue.slice(0, 28);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(formatStrategyAdviceItem(p.issue, tip));
      if (items.length >= 3) break;
    }
    if (items.length >= 3) break;
  }

  if (items.length === 0) return "無";
  return `${items.join("；")}。`;
}
