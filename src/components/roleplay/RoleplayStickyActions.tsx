"use client";

import Link from "next/link";

export function RoleplayStickyActions() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-emerald-100 bg-[#f3fbf6]/95 backdrop-blur">
      <div className="portal-safe-bottom mx-auto flex w-full max-w-lg flex-col gap-2 px-4 pb-3 pt-3">
        <Link
          href="/roleplay/setup"
          className="flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-[15px] font-medium text-white shadow-sm"
        >
          開始對練
        </Link>
        <Link
          href="/roleplay/history"
          className="flex min-h-12 items-center justify-center rounded-xl border border-teal-300 bg-white text-[15px] font-medium text-teal-900"
        >
          歷史紀錄
        </Link>
      </div>
    </div>
  );
}
