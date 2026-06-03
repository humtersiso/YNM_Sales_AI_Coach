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
        <div
          className={`mx-auto mt-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-3xl font-bold text-white shadow`}
        >
          {scoreResult.grade}
        </div>
        <p className="mt-3 text-2xl font-semibold text-emerald-950">{scoreResult.score} 分</p>
        <p className="mt-1 text-sm text-emerald-800">{scoreResult.gradeLabel}</p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-700">{scoreResult.summary}</p>
        <p className="mt-2 text-xs text-teal-800">{scoreResult.advice}</p>
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-emerald-950">各維度回饋</p>
        <ul className="space-y-3">
          {scoreResult.dimensions.map((d) => (
            <li key={d.dimensionId} className="border-b border-emerald-50 pb-3 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-emerald-900">{d.label}</span>
                <span className="text-sm tabular-nums text-teal-800">{d.score}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">{d.comment}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
