"use client";

import { useState } from "react";
import { RoleplaySessionDetailModal } from "@/components/roleplay/RoleplaySessionDetailModal";
import { AppIcon } from "@/components/icons/AppIcon";
import type { RoleplayAdminSession } from "@/lib/analytics/types";
import type { RoleplaySessionDetailView } from "@/lib/roleplay/roleplay-session-detail";
import { formatAskedAtZhTw } from "@/lib/datetime/asked-at";

function sessionRowKey(row: RoleplayAdminSession): string {
  const when = row.finishedAt ?? row.startedAt;
  return `${row.sessionId}:${row.status}:${when}`;
}

export function RoleplaySessionCardList({ sessions }: { sessions: RoleplayAdminSession[] }) {
  const [modalRow, setModalRow] = useState<RoleplayAdminSession | null>(null);
  const [modalDetail, setModalDetail] = useState<RoleplaySessionDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openModal(row: RoleplayAdminSession) {
    setModalRow(row);
    setModalDetail(null);
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/roleplay/sessions/${encodeURIComponent(row.sessionId)}`);
      const data = (await res.json().catch(() => ({}))) as RoleplaySessionDetailView & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "載入失敗");
        return;
      }
      setModalDetail(data);
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    setModalRow(null);
    setModalDetail(null);
    setError("");
    setLoading(false);
  }

  if (sessions.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-base text-emerald-700">尚無對練紀錄</p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-emerald-50">
        {sessions.map((row) => {
          const when = row.finishedAt ?? row.startedAt;
          return (
            <li key={sessionRowKey(row)}>
              <button
                type="button"
                className="w-full px-4 py-4 text-left active:bg-emerald-50/60"
                onClick={() => void openModal(row)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm tabular-nums text-emerald-700">
                    {formatAskedAtZhTw(when)}
                  </p>
                  <AppIcon name="chevron-right" size={18} className="shrink-0 text-emerald-600" />
                </div>
                <p className="mt-2 text-base text-emerald-800">
                  {row.displayName}
                  {row.username && row.username !== row.displayName
                    ? `（${row.username}）`
                    : ""}
                </p>
                <p className="mt-2 text-base font-medium leading-relaxed text-zinc-900">
                  {row.targetModel} vs {row.competitor}
                </p>
                {row.status === "COMPLETED" && row.score != null ? (
                  <p className="mt-2 text-base font-semibold text-emerald-900">
                    {row.grade} · {row.score} 分
                  </p>
                ) : (
                  <p className="mt-2 text-base text-amber-800">尚未取得評分</p>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <RoleplaySessionDetailModal
        open={modalRow != null}
        loading={loading}
        detail={modalDetail}
        whenLabel={
          modalRow ? formatAskedAtZhTw(modalRow.finishedAt ?? modalRow.startedAt) : undefined
        }
        error={error}
        onClose={closeModal}
      />
    </>
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
      <p className="px-3 py-4 text-center text-base text-emerald-700">尚無業代對練資料</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-sm">
        <thead>
          <tr className="border-b border-emerald-100 bg-emerald-50/60 text-emerald-800">
            <th className="px-3 py-2.5 font-medium">姓名</th>
            <th className="px-3 py-2.5 font-medium">據點</th>
            <th className="px-3 py-2.5 font-medium text-right">完賽</th>
            <th className="px-3 py-2.5 font-medium text-right">平均</th>
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
                <td className="px-3 py-2.5 font-medium text-zinc-900">{a.displayName}</td>
                <td className="px-3 py-2.5 text-emerald-800">{a.branch}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{a.completedCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {a.avgScore != null ? `${a.avgScore} 分` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2.5 text-sm text-emerald-600">點選列可篩選該業代歷程</p>
    </div>
  );
}
