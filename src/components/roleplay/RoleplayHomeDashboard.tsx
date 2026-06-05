"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RoleplayDashboardSummary } from "@/components/roleplay/RoleplayDashboardSummary";
import { RoleplayScoreTrend } from "@/components/roleplay/RoleplayScoreTrend";
import { RoleplayStatsOverview } from "@/components/roleplay/RoleplayStatsOverview";
import type { RoleplayDashboardStats } from "@/lib/roleplay/roleplay-types-api";
import type { RoleplayDimensionScore } from "@/lib/roleplay/session-types";

const ORDER = ["empathy", "structure", "factCheck", "strategy", "advance"] as const;

function averagesToDimensions(
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

function CollapsibleSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 marker:content-none">
        <span className="text-sm font-semibold text-emerald-950">{title}</span>
        <span className="text-xs text-emerald-600 group-open:hidden">展開</span>
        <span className="hidden text-xs text-emerald-600 group-open:inline">收合</span>
      </summary>
      {hint ? (
        <p className="border-t border-emerald-50 px-4 pb-2 pt-0 text-xs text-emerald-600">{hint}</p>
      ) : null}
      <div className="border-t border-emerald-50 px-4 pb-4">{children}</div>
    </details>
  );
}

export function RoleplayHomeDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<RoleplayDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const meRes = await fetch("/api/portal/auth/me", { cache: "no-store" });
      const salesRes = await fetch("/api/sales/auth/me", { cache: "no-store" });
      if (!meRes.ok && !salesRes.ok) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/roleplay/me/stats", { cache: "no-store" });
      if (res.ok) {
        setStats((await res.json()) as RoleplayDashboardStats);
      }
      setLoading(false);
    })();
  }, [router]);

  if (loading) {
    return <p className="text-center text-sm text-emerald-600">載入戰績…</p>;
  }

  const completed = stats?.completedSessions ?? stats?.totalSessions ?? 0;
  const hasData = completed > 0;
  const dimensions =
    stats?.dimensionAverages != null
      ? averagesToDimensions(stats.dimensionAverages, stats.dimensionLabels)
      : null;

  const abandoned = Math.max(0, (stats?.startedSessions ?? 0) - completed);

  return (
    <div className="flex flex-col gap-2.5">
      <RoleplayStatsOverview
        started={stats?.startedSessions ?? 0}
        completed={completed}
        abandoned={abandoned}
        overallAvg={stats?.overallAvg ?? 0}
        lastScore={stats?.lastScore ?? null}
        hasData={hasData}
        dimensions={dimensions}
      />

      <CollapsibleSection title="難度戰況" hint="各難度完賽場次與平均">
        <ul className="space-y-2 pt-2">
          {(stats?.byDifficulty ?? []).map((d) => {
            const pct = d.count > 0 ? Math.min(100, d.avgScore) : 0;
            return (
              <li key={d.difficulty}>
                <div className="flex items-center justify-between text-xs text-emerald-800">
                  <span className="font-medium">{d.label}</span>
                  <span className="tabular-nums">
                    {d.count > 0 ? `${d.avgScore} 分 · ${d.count} 場` : "尚未練習"}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-emerald-50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection title="近五場分數走勢">
        <RoleplayScoreTrend points={stats?.scoreTrend ?? []} showTitle={false} />
      </CollapsibleSection>

      <RoleplayDashboardSummary stats={stats ?? emptyStats()} briefing={stats?.briefing ?? null} />
    </div>
  );
}

function emptyStats(): RoleplayDashboardStats {
  return {
    startedSessions: 0,
    completedSessions: 0,
    totalSessions: 0,
    overallAvg: 0,
    lastScore: null,
    byDifficulty: [],
    dimensionAverages: null,
    strongestDimensions: [],
    weakestDimensions: [],
    dimensionLabels: {},
    scoreTrend: [],
    briefing: null,
    suggestions: [],
  };
}
