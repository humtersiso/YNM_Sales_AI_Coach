"use client";

import {
  inferCorrectionCategory,
  normalizeCorrectionPoint,
} from "@/lib/roleplay/engine/correction-utils";
import type { RoleplayCorrectionPoint } from "@/lib/roleplay/session-types";

function CorrectionList({
  items,
  compact,
}: {
  items: RoleplayCorrectionPoint[];
  compact?: boolean;
}) {
  return (
    <ul className={compact ? "mt-2 space-y-2" : "mt-3 space-y-4"}>
      {items.map((c) => (
        <li
          key={`${c.category}-${c.issue}`}
          className={
            compact
              ? "rounded-lg border border-amber-100 bg-white p-2.5 text-sm"
              : "rounded-xl border border-amber-100 bg-white p-3 text-sm text-zinc-800"
          }
        >
          <p className="font-semibold text-amber-950">{c.issue}</p>
          {c.customerAsk ? (
            <p className={`mt-1.5 text-zinc-500 ${compact ? "text-xs" : "text-xs"}`}>
              <span className="font-medium text-zinc-600">客戶問：</span>
              {c.customerAsk}
            </p>
          ) : null}
          {c.whatYouSaid ? (
            <p className={`mt-1.5 text-zinc-500 ${compact ? "text-xs" : "text-xs"}`}>
              <span className="font-medium text-zinc-600">你的說法：</span>
              {c.whatYouSaid}
            </p>
          ) : null}
          <p
            className={`leading-relaxed text-emerald-900 ${compact ? "mt-1.5 text-xs" : "mt-2 text-sm"}`}
          >
            <span className="font-medium text-teal-800">建議這樣說：</span>
            {c.correctGuide}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function RoleplayCorrectionsPanel({
  points,
  compact = false,
}: {
  points: RoleplayCorrectionPoint[];
  compact?: boolean;
}) {
  const normalized = points.map((p) =>
    normalizeCorrectionPoint({
      ...p,
      category: p.category ?? inferCorrectionCategory(p.issue),
      correctGuide: p.correctGuide,
      issue: p.issue,
    }),
  );

  const factItems = normalized.filter((p) => p.category === "fact");
  const strategyItems = normalized.filter((p) => p.category === "strategy");

  if (normalized.length === 0) return null;

  return (
    <div className={compact ? "mt-4" : ""}>
      <p className={`font-semibold text-amber-950 ${compact ? "text-xs" : "text-sm"}`}>
        本場待加強
      </p>
      {!compact ? (
        <p className="mt-1 text-xs text-amber-900/80">
          僅列出客戶有問到、且回應仍不足之處；建議說法依教材整理。
        </p>
      ) : null}

      {factItems.length > 0 ? (
        <div className={compact ? "mt-3" : "mt-4"}>
          <p className={`font-medium text-teal-900 ${compact ? "text-xs" : "text-sm"}`}>
            資訊對錯
          </p>
          <CorrectionList items={factItems} compact={compact} />
        </div>
      ) : null}

      {strategyItems.length > 0 ? (
        <div className={compact ? "mt-3" : "mt-4"}>
          <p className={`font-medium text-teal-900 ${compact ? "text-xs" : "text-sm"}`}>
            銷售策略
          </p>
          <CorrectionList items={strategyItems} compact={compact} />
        </div>
      ) : null}
    </div>
  );
}
