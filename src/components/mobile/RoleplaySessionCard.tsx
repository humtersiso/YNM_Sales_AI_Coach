"use client";

import { useEffect, useState } from "react";
import { RoleplayRadarChart } from "@/components/roleplay/RoleplayRadarChart";
import { AppIcon } from "@/components/icons/AppIcon";
import type { RoleplayAdminSession } from "@/lib/analytics/types";
import type { RoleplayHistoryItem } from "@/lib/roleplay/roleplay-types-api";
import { formatAskedAtZhTw } from "@/lib/datetime/asked-at";

type SessionDetail = {
  sessionId: string;
  status: "COMPLETED" | "STARTED";
  displayName?: string;
  targetModel?: string;
  competitor?: string;
  score?: number | null;
  grade?: string;
  historyItem: RoleplayHistoryItem | null;
  transcriptLines: { at: string; role: "customer" | "agent"; content: string }[];
  error?: string;
};

function sessionRowKey(row: RoleplayAdminSession): string {
  const when = row.finishedAt ?? row.startedAt;
  return `${row.sessionId}:${row.status}:${when}`;
}

function TranscriptCollapsible({
  lines,
}: {
  lines: SessionDetail["transcriptLines"];
}) {
  const [open, setOpen] = useState(false);

  if (lines.length === 0) {
    return <p className="text-sm text-emerald-600">尚無對話逐字稿</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-100 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left active:bg-emerald-50/60"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-emerald-950">
          對話紀錄
          <span className="ml-1 font-normal text-emerald-600">（{lines.length} 則）</span>
        </span>
        <AppIcon
          name="chevron-right"
          size={18}
          className={`shrink-0 text-emerald-600 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open ? (
        <ul className="max-h-56 space-y-2 overflow-y-auto border-t border-emerald-50 px-4 py-3">
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
      ) : null}
    </div>
  );
}

function SessionDetailBody({
  detail,
  row,
}: {
  detail: SessionDetail;
  row: RoleplayAdminSession;
}) {
  if (detail.error) {
    return <p className="text-sm text-red-600">{detail.error}</p>;
  }

  if (detail.status !== "COMPLETED") {
    return (
      <p className="text-base text-amber-800">此場次已開局但未完成評分，尚無完整對練紀錄。</p>
    );
  }

  const item = detail.historyItem;
  const when = row.finishedAt ?? row.startedAt;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
        <p className="text-sm tabular-nums text-emerald-700">{formatAskedAtZhTw(when)}</p>
        <p className="mt-1 text-base text-emerald-900">{row.displayName}</p>
        <p className="mt-1 text-base font-medium text-zinc-900">
          {row.targetModel} vs {row.competitor}
        </p>
        {row.score != null ? (
          <p className="mt-1 text-base font-semibold text-emerald-900">
            {row.grade} · {row.score} 分
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

      <TranscriptCollapsible lines={detail.transcriptLines} />
    </div>
  );
}

function SessionDetailModal({
  row,
  detail,
  loading,
  onClose,
}: {
  row: RoleplayAdminSession;
  detail: SessionDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roleplay-session-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-emerald-100 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-emerald-100 px-4 py-3">
          <h3 id="roleplay-session-modal-title" className="text-base font-semibold text-emerald-950">
            對練紀錄
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50"
            aria-label="關閉"
          >
            <AppIcon name="x" size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="py-12 text-center text-sm text-emerald-600">載入對練紀錄…</p>
          ) : detail ? (
            <SessionDetailBody detail={detail} row={row} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RoleplaySessionCardList({ sessions }: { sessions: RoleplayAdminSession[] }) {
  const [modalRow, setModalRow] = useState<RoleplayAdminSession | null>(null);
  const [modalDetail, setModalDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  async function openModal(row: RoleplayAdminSession) {
    setModalRow(row);
    setModalDetail(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/roleplay/sessions/${encodeURIComponent(row.sessionId)}`);
      const data = (await res.json().catch(() => ({}))) as SessionDetail & { error?: string };
      if (!res.ok) {
        setModalDetail({
          sessionId: row.sessionId,
          status: row.status,
          historyItem: null,
          transcriptLines: [],
          error: data.error ?? "載入失敗",
        });
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

      {modalRow ? (
        <SessionDetailModal
          row={modalRow}
          detail={modalDetail}
          loading={loading}
          onClose={closeModal}
        />
      ) : null}
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
