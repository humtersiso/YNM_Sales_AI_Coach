"use client";

import { useEffect, type ReactNode } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import { RoleplaySessionDetailBody } from "@/components/roleplay/RoleplaySessionDetailBody";
import type { RoleplaySessionDetailView } from "@/lib/roleplay/roleplay-session-detail";

export function RoleplaySessionDetailModal({
  open,
  title = "對練紀錄",
  loading,
  detail,
  whenLabel,
  error,
  onClose,
  footer,
}: {
  open: boolean;
  title?: string;
  loading: boolean;
  detail: RoleplaySessionDetailView | null;
  whenLabel?: string;
  error?: string;
  onClose: () => void;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roleplay-session-detail-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-emerald-100 bg-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-emerald-100 px-4 py-3">
          <h3
            id="roleplay-session-detail-modal-title"
            className="text-base font-semibold text-emerald-950"
          >
            {title}
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
          ) : (
            <RoleplaySessionDetailBody detail={detail} whenLabel={whenLabel} error={error} />
          )}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-emerald-100 px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
