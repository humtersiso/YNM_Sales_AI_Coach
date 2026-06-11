"use client";

import {
  formatRadarDimensionScore,
  RoleplayRadarChart,
} from "@/components/roleplay/RoleplayRadarChart";
import type { RoleplayDimensionScore } from "@/lib/roleplay/session-types";

export function RoleplayStatsOverview({
  started,
  completed,
  abandoned,
  overallAvg,
  lastScore,
  hasData,
  dimensions,
}: {
  started: number;
  completed: number;
  abandoned: number;
  overallAvg: number;
  lastScore: number | null;
  hasData: boolean;
  dimensions: RoleplayDimensionScore[] | null;
}) {
  const radarTotal =
    dimensions?.reduce((s, d) => s + (d.score ?? 0), 0) ?? overallAvg;

  const kpis = [
    { label: "開局", value: started },
    { label: "完成", value: completed, hint: abandoned > 0 ? `未完成 ${abandoned}` : undefined },
    {
      label: "均分",
      value: hasData ? formatRadarDimensionScore(radarTotal) : "—",
      hint: hasData ? "近10場" : undefined,
    },
    { label: "最近", value: lastScore != null ? lastScore : "—" },
  ];

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <div
        className="grid grid-cols-4 divide-x divide-emerald-100 overflow-hidden rounded-t-2xl px-1 py-2.5"
        style={{ background: `linear-gradient(to bottom, var(--surface-gradient-from), var(--card))` }}
      >
        {kpis.map((k) => (
          <div key={k.label} className="min-w-0 px-1 text-center">
            <p className="text-xs font-medium text-emerald-600">{k.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-950">{k.value}</p>
            {k.hint ? (
              <p className="mt-1 text-[10px] leading-tight text-amber-600">{k.hint}</p>
            ) : (
              <span className="mt-1 block h-[14px]" aria-hidden />
            )}
          </div>
        ))}
      </div>

      {hasData && dimensions ? (
        <div className="border-t border-emerald-50 px-2.5 pb-2 pt-1.5">
          <RoleplayRadarChart
            variant="overview"
            dimensions={dimensions}
            embedded
            showScores
            scoreDecimals={1}
            chartSizePx={292}
            labelScreenPxWithScore={11}
          />
          <p className="mt-1 text-center text-[10px] text-emerald-500">近 10 場完賽均分 · 各維 0–20</p>
        </div>
      ) : (
        <p className="border-t border-emerald-50 px-4 py-4 text-center text-sm text-emerald-600">
          完成首場對練後顯示五維雷達
        </p>
      )}
    </section>
  );
}
