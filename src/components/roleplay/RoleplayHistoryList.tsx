"use client";

import { useState } from "react";
import Link from "next/link";
import { RoleplayRadarChart } from "@/components/roleplay/RoleplayRadarChart";
import type { RoleplayHistoryItem } from "@/lib/roleplay/roleplay-types-api";

function formatDateTime(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildSetupHref(item: RoleplayHistoryItem): string {
  const q = new URLSearchParams({
    productLine: "xtrail-ice",
    personaId: item.customerType,
    ageRange: item.ageRange,
    competitor: item.competitor,
    difficulty: String(item.difficulty),
    maxTurns: "5",
  });
  return `/roleplay/setup?${q.toString()}`;
}

export function RoleplayHistoryList({ items }: { items: RoleplayHistoryItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-emerald-200 bg-white/60 p-6 text-center text-sm text-emerald-700">
        尚無對練紀錄，開始一場演練後會顯示於此。
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const open = expandedId === item.sessionId;
        const completed = item.status === "COMPLETED";
        return (
          <li
            key={item.sessionId}
            className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm"
          >
            <button
              type="button"
              className="flex w-full flex-col gap-1 p-4 text-left"
              onClick={() => setExpandedId(open ? null : item.sessionId)}
              aria-expanded={open}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs tabular-nums text-emerald-600">
                  {completed
                    ? formatDateTime(item.completedAt)
                    : formatDateTime(item.startedAt)}
                </p>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-sm font-semibold tabular-nums ${
                    completed
                      ? "bg-teal-50 text-teal-900"
                      : "bg-amber-50 text-amber-900"
                  }`}
                >
                  {completed ? `${item.score} 分 · ${item.grade}` : "未完成"}
                </span>
              </div>
              <p className="text-sm font-medium text-emerald-950">
                {item.targetModel} vs {item.competitor}
              </p>
              <p className="text-xs text-emerald-700">
                {item.customerTypeName} · {item.difficultyLabel}
              </p>
            </button>

            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="border-t border-emerald-50 px-4 pb-4 pt-2">
                  {!completed ? (
                    <p className="text-sm text-amber-800">
                      此場次已開局但未完成評分；可重新以相似設定開始新演練。
                    </p>
                  ) : (
                    <>
                      {item.dimensions.length > 0 ? (
                        <RoleplayRadarChart
                          variant="compact"
                          dimensions={item.dimensions}
                        />
                      ) : null}

                      <ul className="mt-3 space-y-1 text-sm text-emerald-900">
                        {item.dimensions.map((d) => (
                          <li
                            key={d.dimensionId}
                            className="flex justify-between tabular-nums"
                          >
                            <span>{d.label}</span>
                            <span>
                              {d.score}/{d.maxScore}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {item.summary ? (
                        <p className="mt-3 text-sm text-emerald-800">{item.summary}</p>
                      ) : null}

                      {item.improvementTips.length > 0 ? (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-amber-950">改善方向</p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-amber-900">
                            {item.improvementTips.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {item.unusedStrategies.length > 0 ? (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-emerald-950">
                            可再運用的策略
                          </p>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-emerald-800">
                            {item.unusedStrategies.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  )}

                  <Link
                    href={buildSetupHref(item)}
                    className="mt-4 block text-center text-sm font-medium text-teal-700 underline"
                  >
                    用相似設定再練
                  </Link>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
