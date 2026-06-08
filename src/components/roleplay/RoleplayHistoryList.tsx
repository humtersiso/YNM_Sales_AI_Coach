"use client";

import { useState } from "react";
import Link from "next/link";
import { RoleplayCorrectionsPanel } from "@/components/roleplay/RoleplayCorrectionsPanel";
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
                      {item.summary || item.dimensions.length > 0 ? (
                        <div className="flex w-full items-start gap-3">
                          {item.summary ? (
                            <div className="w-[40%] min-w-0 shrink-0">
                              <p className="text-sm font-semibold text-emerald-950">評語</p>
                              <p className="mt-2 text-sm leading-relaxed text-emerald-800">
                                {item.summary}
                              </p>
                            </div>
                          ) : (
                            <div className="w-[40%] shrink-0" />
                          )}
                          {item.dimensions.length > 0 ? (
                            <div className="flex w-[60%] min-w-0 justify-center [&_svg]:mx-auto [&_svg]:h-[200px] [&_svg]:w-[200px] [&_svg]:max-w-[200px]">
                              <RoleplayRadarChart
                                variant="default"
                                dimensions={item.dimensions}
                                embedded
                                showScores
                                chartSizePx={200}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {item.correctionPoints?.length > 0 ? (
                        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                          <RoleplayCorrectionsPanel points={item.correctionPoints} compact />
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
