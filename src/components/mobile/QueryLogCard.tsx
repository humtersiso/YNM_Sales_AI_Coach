"use client";

import { useState } from "react";
import type { QueryLog } from "@/lib/analytics/types";
import { formatAskedAtZhTw } from "@/lib/datetime/asked-at";
import { AppIcon } from "@/components/icons/AppIcon";

function KindBadge({ kind }: { kind: QueryLog["questionKind"] }) {
  if (kind === "new") {
    return (
      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
        新問題
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
      題庫回覆
    </span>
  );
}

function QueryLogRow({ row }: { row: QueryLog }) {
  const [open, setOpen] = useState(false);
  const answer = (row.fullReply || row.replySummary || "").trim();
  const canExpand = answer.length > 0;

  return (
    <li className={row.questionKind === "new" ? "bg-amber-50/30" : ""}>
      <button
        type="button"
        disabled={!canExpand}
        onClick={() => canExpand && setOpen((v) => !v)}
        aria-expanded={canExpand ? open : undefined}
        className={`w-full px-3 py-3 text-left transition-colors ${
          canExpand ? "cursor-pointer hover:bg-emerald-50/60" : "cursor-default"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] tabular-nums text-emerald-700">
            {formatAskedAtZhTw(row.askedAt)}
          </p>
          <div className="flex items-center gap-2">
            {canExpand ? (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700">
                {open ? "收合" : "展開回答"}
                <AppIcon
                  name="chevron-right"
                  size={14}
                  className={`rotate-90 text-emerald-600 transition-transform ${open ? "-rotate-90" : ""}`}
                />
              </span>
            ) : null}
            <KindBadge kind={row.questionKind} />
          </div>
        </div>
        <p className="mt-1 text-xs text-emerald-800">
          {row.branch} · {row.agentName}
        </p>
        <p className="mt-1.5 text-sm font-medium leading-relaxed text-zinc-900">{row.question}</p>
        {!canExpand && row.questionKind === "new" ? (
          <p className="mt-2 text-xs text-amber-800/80">尚未建檔，無系統回覆</p>
        ) : null}
      </button>

      {canExpand && open ? (
        <div className="border-t border-emerald-100 bg-emerald-50/40 px-3 pb-3 pt-2">
          <p className="text-[11px] font-medium text-emerald-800">回答</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{answer}</p>
        </div>
      ) : null}
    </li>
  );
}

export function QueryLogCardList({ logs }: { logs: QueryLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-emerald-700">尚無提問紀錄</p>
    );
  }

  return (
    <ul className="divide-y divide-emerald-50">
      {logs.map((row) => (
        <QueryLogRow key={row.id} row={row} />
      ))}
    </ul>
  );
}
