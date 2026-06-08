"use client";

import { RoleplayCorrectionsPanel } from "@/components/roleplay/RoleplayCorrectionsPanel";
import { RoleplayRadarChart } from "@/components/roleplay/RoleplayRadarChart";
import type { RoleplaySessionDetailView } from "@/lib/roleplay/roleplay-session-detail";

function TranscriptBlock({
  lines,
}: {
  lines: RoleplaySessionDetailView["transcriptLines"];
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-emerald-600">尚無對話紀錄</p>;
  }

  return (
    <div>
      <p className="text-sm font-semibold text-emerald-950">
        對話紀錄
        <span className="ml-1 font-normal text-emerald-600">（{lines.length} 則）</span>
      </p>
      <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-emerald-100 bg-white p-3">
        {lines.map((line, i) => (
          <li
            key={i}
            className={`rounded-lg px-3 py-2 text-sm ${
              line.role === "customer"
                ? "bg-slate-50 text-slate-800"
                : "bg-emerald-50 text-emerald-900"
            }`}
          >
            <p className="text-xs text-emerald-600">
              {line.role === "customer" ? "客戶" : "業代"}
              {line.at ? ` · ${line.at}` : ""}
            </p>
            <p className="mt-0.5 leading-relaxed">{line.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RoleplaySessionDetailBody({
  detail,
  whenLabel,
  error,
}: {
  detail: RoleplaySessionDetailView | null;
  whenLabel?: string;
  error?: string;
}) {
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!detail) return null;

  if (detail.status !== "COMPLETED") {
    return (
      <p className="text-sm text-amber-800">
        此場次已開局但未完成評分，尚無完整對練紀錄。
      </p>
    );
  }

  const item = detail.historyItem;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
        {whenLabel ? (
          <p className="text-sm tabular-nums text-emerald-700">{whenLabel}</p>
        ) : null}
        {detail.displayName ? (
          <p className="mt-1 text-base text-emerald-900">{detail.displayName}</p>
        ) : null}
        <p className={`text-base font-medium text-zinc-900 ${whenLabel || detail.displayName ? "mt-1" : ""}`}>
          {detail.targetModel} vs {detail.competitor}
        </p>
        {detail.score != null ? (
          <p className="mt-1 text-base font-semibold text-emerald-900">
            {detail.grade} · {detail.score} 分
          </p>
        ) : null}
      </div>

      {item && (item.summary || item.dimensions.length > 0) ? (
        <div className="flex w-full items-start gap-3">
          {item.summary ? (
            <div className="w-[40%] min-w-0 shrink-0">
              <p className="text-sm font-semibold text-emerald-950">評語</p>
              <p className="mt-2 text-sm leading-relaxed text-emerald-800">{item.summary}</p>
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

      {item && item.correctionPoints.length > 0 ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
          <RoleplayCorrectionsPanel points={item.correctionPoints} compact />
        </div>
      ) : null}

      {item && item.improvementTips.length > 0 ? (
        <div>
          <p className="text-sm font-semibold text-amber-950">改善方向</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-amber-900">
            {item.improvementTips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <TranscriptBlock lines={detail.transcriptLines} />
    </div>
  );
}
