import type { RoleplayCompletedDetail } from "@/lib/bq/roleplay-sessions-bq";
import { inferCorrectionCategory } from "@/lib/roleplay/engine/correction-utils";
import type { RoleplayCorrectionPoint } from "@/lib/roleplay/session-types";

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
  if (d.correctionPoints?.length) return d.correctionPoints;
  return parseCorrectionPointsFromReport(d.reportJson);
}

function extractExamFactLine(guide: string, issue: string, competitor: string): string {
  const g = guide.trim().replace(/\s+/g, " ");
  const nums = [...g.matchAll(/\d[\d,.]*(?:\s*(?:萬|公里|km\/L|km|分貝|元|千|%|年))?/gi)].map(
    (m) => m[0],
  );
  if (nums.length === 0) return "";

  const brand =
    /TUCSON|RAV4|CR-V|Sportage/i.exec(g)?.[0] ??
    /TUCSON|RAV4|CR-V|Sportage/i.exec(issue)?.[0] ??
    competitor.split(/\s+/)[0] ??
    "競品";

  const topic =
    /定保|保養|回廠/.test(issue + g)
      ? "定保費用"
      : /油耗|WLTC|油費|油資/.test(issue + g)
        ? "油耗／油費"
        : /隔音|分貝|玻璃/.test(issue + g)
          ? "隔音數據"
          : /零件|維修|引擎|CVT/.test(issue + g)
            ? "維修／耐用"
            : "關鍵數據";

  const numPart = nums.slice(0, 3).join("、");
  return `須牢記 ${brand} ${topic}：${numPart}（請對照教材原文，答題須精確）`;
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

/**
 * 記憶重點：彙整近 N 場「資訊對錯」待加強，像考試必背。
 * 無資料回傳 []（UI 顯示「無」）。
 */
export function buildFactMemoryLinesFromCorrections(
  sessions: RoleplayCompletedDetail[],
): string[] {
  const recent = takeRecentCompletedSessions(sessions);
  const issueCount = new Map<string, { line: string; count: number }>();
  const seenGuide = new Set<string>();

  for (const s of recent) {
    for (const p of correctionPointsFromDetail(s)) {
      const cat = p.category ?? inferCorrectionCategory(p.issue);
      if (cat !== "fact") continue;
      if (!p.correctGuide || !/\d/.test(p.correctGuide)) continue;

      const line =
        extractExamFactLine(p.correctGuide, p.issue, s.competitor) ||
        `須牢記：${p.correctGuide.slice(0, 72)}`;
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
      return line.replace(/（請對照.*）$/, "") + `（近${recent.length}場中曾${count}次待加強）`;
    }
    return line;
  });
}

/**
 * 建議：彙整近 N 場「銷售策略」待加強。
 * 無資料回傳「無」。
 */
export function buildStrategyAdviceFromCorrections(
  sessions: RoleplayCompletedDetail[],
): string {
  const recent = takeRecentCompletedSessions(sessions);
  const tips = new Set<string>();

  for (const s of recent) {
    for (const p of correctionPointsFromDetail(s)) {
      const cat = p.category ?? inferCorrectionCategory(p.issue);
      if (cat !== "strategy") continue;
      const tip = simplifyStrategyLine(p.correctGuide, p.issue);
      if (tip) tips.add(tip);
    }
  }

  if (tips.size === 0) return "無";
  return [...tips].slice(0, 2).join("；") + "。";
}
