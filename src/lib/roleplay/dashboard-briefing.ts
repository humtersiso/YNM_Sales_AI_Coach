import type {
  RoleplayDashboardBriefing,
  RoleplayDashboardStats,
} from "@/lib/roleplay/roleplay-types-api";
import {
  abandonedSessionMin,
  BRIEFING_ADVICE_LINE_MAX_CHARS,
} from "@/lib/roleplay/dashboard-briefing-cache";
import { normalizeBriefingLines } from "@/lib/roleplay/briefing-numeral-format";
import { ruleKnowledgeLines } from "@/lib/roleplay/briefing-knowledge-reminders";

function ruleTrendLine(
  trend: RoleplayDashboardStats["scoreTrend"],
  completedSessions: number,
  overallAvg: number,
): string {
  const last5 = trend.slice(-5);
  if (last5.length < 2) return "完賽場次尚少，完成更多對練後可觀察走勢。";
  const first = last5[0].score;
  const last = last5[last5.length - 1].score;
  const delta = last - first;
  const seq = last5.map((p) => p.score).join("→");
  const prefix =
    completedSessions >= 2
      ? `累計 ${completedSessions} 場對練平均 ${Math.round(overallAvg)} 分，近 5 場分數 ${seq}，`
      : `近 5 場 ${seq}，`;
  if (delta >= 8) return `${prefix}近期狀態顯著回升。`;
  if (delta >= 3) return `${prefix}整體小幅進步。`;
  if (delta <= -8) return `${prefix}分數下滑，建議檢視弱項。`;
  if (delta <= -3) return `${prefix}略為回落，可針對待加強維度多練。`;
  return `${prefix}表現持平，維持節奏即可。`;
}

function ruleAdviceLine(
  stats: RoleplayDashboardStats,
  strong: string[],
  weak: string[],
  trendLine: string,
): string {
  const incomplete = stats.startedSessions > stats.completedSessions;
  const parts: string[] = [];
  if (incomplete) parts.push("先將開局場次完賽取得評分");
  if (weak.length) parts.push(`優先加強${weak.join("、")}`);
  if (stats.suggestions[0]) parts.push(`可試 ${stats.suggestions[0].label}`);
  if (!parts.length) parts.push("維持現有練習節奏並挑戰更高難度");
  if (trendLine.includes("下滑")) parts.unshift("檢視近場對話是否缺少數據支撐");
  if (strong.length && !weak.length) return parts.join("，") + "。";
  return parts.join("，") + "。";
}

/** 規則小結（Gemini 失敗時 fallback） */
export function buildRuleDashboardBriefing(
  stats: RoleplayDashboardStats,
): RoleplayDashboardBriefing {
  const avg = stats.dimensionAverages;
  const strongIds = stats.strongestDimensions;
  const weakIds = stats.weakestDimensions;
  const strongLabels = strongIds.map((id) => stats.dimensionLabels[id] ?? id);
  const weakLabels = weakIds.map((id) => stats.dimensionLabels[id] ?? id);

  let strengthLine = "尚無完賽資料，完成首場後會產生分析。";
  let weaknessLine = "—";
  if (avg) {
    if (strongLabels.length) {
      const scores = strongIds.map((id) => avg[id as keyof typeof avg] ?? 0).join("、");
      strengthLine = `${strongLabels.join("、")}表現較佳（約 ${scores} 分）。`;
    }
    if (weakLabels.length) {
      const scores = weakIds.map((id) => avg[id as keyof typeof avg] ?? 0).join("、");
      weaknessLine = `${weakLabels.join("、")}待加強（約 ${scores} 分）。`;
    } else {
      weaknessLine = "各維度均衡，可挑戰更高難度。";
    }
  }

  const trendLine = ruleTrendLine(
    stats.scoreTrend,
    stats.completedSessions,
    stats.overallAvg,
  );
  const abandoned = Math.max(0, stats.startedSessions - stats.completedSessions);
  const knowledgeLines =
    (stats.correctionMemoryLines?.length ?? 0) > 0
      ? stats.correctionMemoryLines!
      : (stats.factMemoryLines?.length ?? 0) > 0
        ? stats.factMemoryLines!.map((line) =>
            line.startsWith("【")
              ? line
              : `【資訊對錯】${line.replace(/^須牢記：?|^記熟：?/, "")}`,
          )
        : ruleKnowledgeLines(stats.knowledgeReminders ?? []).filter((l) =>
            /【資訊對錯】/.test(l) || /\d{3,}|\d[\d,.]*(?:萬|元|千|公里|km)/i.test(l),
          );
  const adviceLine =
    stats.strategyAdviceFromCorrections?.trim() ||
    (stats.completedSessions > 0 ? "無" : ruleAdviceLine(stats, strongLabels, weakLabels, trendLine));
  return normalizeBriefingLines(
    appendAbandonedReminder(
      { strengthLine, weaknessLine, trendLine, adviceLine, knowledgeLines },
      abandoned,
    ),
  );
}

/** 未完成場次達門檻時強化 adviceLine（可覆寫舊的未完賽提醒以更新場次數） */
export function appendAbandonedReminder(
  briefing: RoleplayDashboardBriefing,
  abandonedSessions: number,
): RoleplayDashboardBriefing {
  const min = abandonedSessionMin();
  const stripAbandonedHint = (line: string) =>
    line
      .replace(/[，,]?[^，,。]*?(?:尚未完賽|未完賽)[^。]*。?$/u, "")
      .replace(/[，,]\s*$/u, "")
      .trim();

  if (abandonedSessions < min) {
    const adviceLine = stripAbandonedHint(briefing.adviceLine);
    if (adviceLine === briefing.adviceLine) return briefing;
    return { ...briefing, adviceLine: adviceLine || briefing.adviceLine };
  }

  const hint = `另有 ${abandonedSessions} 場尚未完賽，建議先打完再開新局。`;
  const base = stripAbandonedHint(briefing.adviceLine);
  const adviceLine =
    base && base.length + hint.length + 1 <= BRIEFING_ADVICE_LINE_MAX_CHARS
      ? `${base.replace(/。$/u, "")}，${hint}`
      : hint;
  return { ...briefing, adviceLine };
}
