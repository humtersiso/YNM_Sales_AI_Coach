"use client";

import type { RoleplayScenarioPublicView } from "@/lib/roleplay/scenario-contract";

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "簡單",
  normal: "一般",
  hard: "困難",
};

export function RoleplayScenarioPicker({
  scenarios,
  selectedId,
  onSelect,
  disabled,
}: {
  scenarios: RoleplayScenarioPublicView[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  if (scenarios.length === 0) {
    return <p className="text-sm text-emerald-700">尚無可用情境</p>;
  }

  return (
    <ul className="space-y-2">
      {scenarios.map((s) => {
        const active = s.scenarioId === selectedId;
        return (
          <li key={s.scenarioId}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(s.scenarioId)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                active
                  ? "border-teal-500 bg-teal-50 ring-1 ring-teal-400"
                  : "border-emerald-100 bg-white hover:border-teal-200"
              } disabled:opacity-60`}
            >
              <p className="text-[15px] font-semibold text-emerald-950">{s.title}</p>
              <p className="mt-1 text-xs text-emerald-700">
                {s.productDisplayName} · vs {s.competitor}
              </p>
              <p className="mt-1 text-xs text-emerald-600 line-clamp-2">{s.coreIssue}</p>
              <p className="mt-2 text-[11px] text-teal-800">
                {DIFFICULTY_LABEL[s.difficulty] ?? s.difficulty} · 最多 {s.maxTurns} 輪
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
