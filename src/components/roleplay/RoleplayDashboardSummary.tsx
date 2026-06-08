"use client";

import type { ReactNode } from "react";
import { RoleplayRadarChart } from "@/components/roleplay/RoleplayRadarChart";
import type { RoleplayDashboardBriefing, RoleplayDashboardStats } from "@/lib/roleplay/roleplay-types-api";
import type { RoleplayDimensionScore } from "@/lib/roleplay/session-types";

const ORDER = ["empathy", "structure", "factCheck", "strategy", "advance"] as const;

function toDimensions(
  avg: NonNullable<RoleplayDashboardStats["dimensionAverages"]>,
  labels: Record<string, string>,
): RoleplayDimensionScore[] {
  return ORDER.map((id) => ({
    dimensionId: id,
    label: labels[id] ?? id,
    score: avg[id] ?? 0,
    maxScore: 20,
    comment: "",
  }));
}

function SummaryRow({
  label,
  line,
  radar,
}: {
  label: string;
  line: string;
  radar?: ReactNode;
}) {
  return (
    <div className="flex gap-2.5 border-b border-emerald-50 py-2.5 last:border-0 last:pb-0 first:pt-0">
      {radar ? <div className="w-[88px] shrink-0">{radar}</div> : null}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-xs font-semibold text-emerald-900">{label}</p>
        <p className="mt-0.5 text-sm leading-snug text-emerald-800">{line}</p>
      </div>
    </div>
  );
}

export function RoleplayDashboardSummary({
  stats,
  briefing,
}: {
  stats: RoleplayDashboardStats;
  briefing: RoleplayDashboardBriefing | null;
}) {
  const hasData = (stats.completedSessions ?? stats.totalSessions) > 0;
  const avg = stats.dimensionAverages;
  const dimensions = avg ? toDimensions(avg, stats.dimensionLabels) : null;

  if (!hasData || !dimensions) {
    return (
      <section className="rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50/80 to-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-emerald-950">小結</h2>
        <p className="mt-2 text-sm text-emerald-700">
          完成第一場對練後，會依五維與近五場走勢產生精簡小結與建議。
        </p>
      </section>
    );
  }

  if (!briefing) {
    return (
      <section className="rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50/80 to-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-emerald-950">小結</h2>
        <p className="mt-2 text-sm text-emerald-700">
          小結會在您完賽評分後自動更新；請再完成一場對練，或稍後重新整理首頁。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-teal-200 bg-gradient-to-b from-teal-50/80 to-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-emerald-950">小結</h2>
        {stats.briefingStale ? (
          <span className="text-xs text-amber-700">小結更新中…</span>
        ) : null}
      </div>
      <div className="mt-2">
        <SummaryRow
          label="做得好的"
          line={briefing.strengthLine}
          radar={
            <RoleplayRadarChart
              variant="mini"
              dimensions={dimensions}
              highlightIds={stats.strongestDimensions}
            />
          }
        />
        <SummaryRow
          label="待加強的"
          line={briefing.weaknessLine}
          radar={
            <RoleplayRadarChart
              variant="mini"
              dimensions={dimensions}
              highlightIds={stats.weakestDimensions}
            />
          }
        />
        <SummaryRow label="進步趨勢" line={briefing.trendLine} />
        <SummaryRow label="建議" line={briefing.adviceLine?.trim() || "無"} />
        <div className="border-b border-emerald-50 py-2.5 last:border-0">
          <p className="text-xs font-semibold text-emerald-900">記憶重點</p>
          {(briefing.knowledgeLines?.length ?? 0) > 0 ? (
            <ul className="mt-1 space-y-1">
              {briefing.knowledgeLines!.map((line) => (
                <li
                  key={line}
                  className="break-words text-sm leading-relaxed text-emerald-800 [overflow-wrap:anywhere]"
                >
                  <span className="mr-1.5 font-medium text-emerald-900">•</span>
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-sm text-emerald-800">無</p>
          )}
        </div>
      </div>
    </section>
  );
}
