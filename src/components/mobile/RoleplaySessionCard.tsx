"use client";

import type { RoleplayAdminSession } from "@/lib/analytics/types";
import { formatAskedAtZhTw } from "@/lib/datetime/asked-at";

function StatusBadge({ status }: { status: RoleplayAdminSession["status"] }) {
  if (status === "COMPLETED") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        已完賽
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
      未完賽
    </span>
  );
}

function sessionRowKey(row: RoleplayAdminSession): string {
  const when = row.finishedAt ?? row.startedAt;
  return `${row.sessionId}:${row.status}:${when}`;
}

export function RoleplaySessionCardList({ sessions }: { sessions: RoleplayAdminSession[] }) {
  if (sessions.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-emerald-700">尚無對練紀錄</p>
    );
  }

  return (
    <ul className="divide-y divide-emerald-50">
      {sessions.map((row) => {
        const when = row.finishedAt ?? row.startedAt;
        return (
          <li key={sessionRowKey(row)} className="px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] tabular-nums text-emerald-700">
                {formatAskedAtZhTw(when)}
              </p>
              <StatusBadge status={row.status} />
            </div>
            <p className="mt-1 text-xs text-emerald-800">
              {row.branch} · {row.displayName}
              {row.username && row.username !== row.displayName
                ? `（${row.username}）`
                : ""}
            </p>
            <p className="mt-1.5 text-sm font-medium leading-relaxed text-zinc-900">
              {row.targetModel} vs {row.competitor}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              客型 {row.personaId} · 難度 {row.difficulty}
              {row.durationMin != null ? ` · 約 ${row.durationMin} 分鐘` : ""}
            </p>
            {row.status === "COMPLETED" && row.score != null ? (
              <p className="mt-1.5 text-sm font-semibold text-emerald-900">
                {row.grade} · {row.score} 分
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-amber-800">尚未取得評分</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function RoleplayAgentSummaryTable({
  summaries,
  selectedUserId,
  onSelect,
}: {
  summaries: import("@/lib/analytics/types").RoleplayAgentSummary[];
  selectedUserId: string;
  onSelect: (userId: string) => void;
}) {
  if (summaries.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-sm text-emerald-700">尚無業代對練資料</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-xs">
        <thead>
          <tr className="border-b border-emerald-100 bg-emerald-50/60 text-emerald-800">
            <th className="px-2 py-2 font-medium">姓名</th>
            <th className="px-2 py-2 font-medium">據點</th>
            <th className="px-2 py-2 font-medium text-right">完賽</th>
            <th className="px-2 py-2 font-medium text-right">平均</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((a) => {
            const active = selectedUserId === a.userId;
            return (
              <tr
                key={a.userId}
                className={`cursor-pointer border-b border-emerald-50 ${active ? "bg-emerald-100/70" : "hover:bg-emerald-50/50"}`}
                onClick={() => onSelect(active ? "all" : a.userId)}
              >
                <td className="px-2 py-2 font-medium text-zinc-900">{a.displayName}</td>
                <td className="px-2 py-2 text-emerald-800">{a.branch}</td>
                <td className="px-2 py-2 text-right tabular-nums">{a.completedCount}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {a.avgScore != null ? `${a.avgScore} 分` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-2 py-2 text-[11px] text-emerald-600">點選列可篩選該業代歷程</p>
    </div>
  );
}
