"use client";

import { useState } from "react";
import Link from "next/link";
import { AppIcon } from "@/components/icons/AppIcon";
import { RoleplaySessionDetailModal } from "@/components/roleplay/RoleplaySessionDetailModal";
import type { RoleplayHistoryItem } from "@/lib/roleplay/roleplay-types-api";
import type { RoleplaySessionDetailView } from "@/lib/roleplay/roleplay-session-detail";

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
  const [modalItem, setModalItem] = useState<RoleplayHistoryItem | null>(null);
  const [modalDetail, setModalDetail] = useState<RoleplaySessionDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openModal(item: RoleplayHistoryItem) {
    setModalItem(item);
    setModalDetail(null);
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/roleplay/me/sessions/${encodeURIComponent(item.sessionId)}`,
        { cache: "no-store" },
      );
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
    setModalItem(null);
    setModalDetail(null);
    setError("");
    setLoading(false);
  }

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-emerald-200 bg-white/60 p-6 text-center text-sm text-emerald-700">
        尚無對練紀錄，開始一場演練後會顯示於此。
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {items.map((item) => {
          const completed = item.status === "COMPLETED";
          return (
            <li key={item.sessionId}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm active:bg-emerald-50/50"
                onClick={() => void openModal(item)}
              >
                <div className="min-w-0 flex-1">
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
                  <p className="mt-1 text-sm font-medium text-emerald-950">
                    {item.targetModel} vs {item.competitor}
                  </p>
                  <p className="text-xs text-emerald-700">
                    {item.customerTypeName} · {item.difficultyLabel}
                  </p>
                </div>
                <AppIcon name="chevron-right" size={18} className="shrink-0 text-emerald-600" />
              </button>
            </li>
          );
        })}
      </ul>

      <RoleplaySessionDetailModal
        open={modalItem != null}
        loading={loading}
        detail={modalDetail}
        whenLabel={
          modalItem
            ? formatDateTime(
                modalItem.status === "COMPLETED"
                  ? modalItem.completedAt
                  : modalItem.startedAt,
              )
            : undefined
        }
        error={error}
        onClose={closeModal}
        footer={
          modalItem ? (
            <Link
              href={buildSetupHref(modalItem)}
              className="block text-center text-sm font-medium text-teal-700 underline"
              onClick={closeModal}
            >
              用相似設定再練
            </Link>
          ) : null
        }
      />
    </>
  );
}
