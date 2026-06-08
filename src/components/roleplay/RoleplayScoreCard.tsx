import { RoleplayCorrectionsPanel } from "@/components/roleplay/RoleplayCorrectionsPanel";
import { RoleplayRadarChart } from "@/components/roleplay/RoleplayRadarChart";
import type { RoleplayScoreResult } from "@/lib/roleplay/session-types";

const GRADE_STYLE: Record<string, string> = {
  S: "from-amber-400 to-yellow-500",
  A: "from-emerald-500 to-teal-500",
  B: "from-teal-500 to-cyan-500",
  C: "from-orange-400 to-amber-500",
  D: "from-zinc-400 to-zinc-500",
};

export function RoleplayScoreCard({
  scenarioTitle,
  scoreResult,
}: {
  scenarioTitle: string;
  scoreResult: RoleplayScoreResult;
}) {
  const gradient = GRADE_STYLE[scoreResult.grade] ?? GRADE_STYLE.B;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-100 bg-white p-5 text-center shadow-sm">
        <p className="text-sm text-emerald-700">{scenarioTitle}</p>
        <p className="mt-4 text-4xl font-bold tabular-nums text-emerald-950">
          {scoreResult.score}
          <span className="text-lg font-normal text-emerald-600"> / 100</span>
        </p>
        <div
          className={`mx-auto mt-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-xl font-bold text-white shadow`}
        >
          {scoreResult.grade}
        </div>
        <p className="mt-2 text-sm text-emerald-800">{scoreResult.gradeLabel}</p>
        {scoreResult.previousScore != null && scoreResult.scoreDelta != null ? (
          <p className="mt-2 text-xs text-teal-800">
            較上一場完賽 {scoreResult.previousScore} 分 → 本場 {scoreResult.score} 分
            <span className="tabular-nums">
              {scoreResult.scoreDelta >= 0
                ? `（+${scoreResult.scoreDelta}）`
                : `（${scoreResult.scoreDelta}）`}
            </span>
          </p>
        ) : null}
        <p className="mt-3 text-sm leading-relaxed text-zinc-700">{scoreResult.summary}</p>
        <p className="mt-2 text-xs text-teal-800">{scoreResult.advice}</p>
      </div>

      <RoleplayRadarChart dimensions={scoreResult.dimensions} />

      {(scoreResult.correctionPoints?.length ?? 0) > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <RoleplayCorrectionsPanel points={scoreResult.correctionPoints ?? []} />
        </div>
      ) : null}

      <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-emerald-950">各維度得分</p>
        <ul className="space-y-3">
          {scoreResult.dimensions.map((d) => (
            <li key={d.dimensionId} className="border-b border-emerald-50 pb-3 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-emerald-900">{d.label}</span>
                <span className="text-sm tabular-nums text-teal-800">
                  {d.score} / {d.maxScore ?? 20}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">{d.comment}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
