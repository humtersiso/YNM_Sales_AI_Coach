"use client";

import Link from "next/link";
import { AppIcon } from "@/components/icons/AppIcon";

const cards = [
  {
    href: "/admin/usage/sales",
    title: "銷售助手使用狀況",
    desc: "提問紀錄、活躍業代與題庫／新問題分布",
    icon: "message" as const,
  },
  {
    href: "/admin/usage/roleplay",
    title: "對練助手使用狀況",
    desc: "完賽場次、業代平均分與歷程紀錄",
    icon: "target" as const,
  },
];

export default function AdminHomePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-950">主頁儀表板</h1>
        <p className="mt-1 text-base text-emerald-700">選擇要查看的使用統計</p>
      </div>

      <div className="grid gap-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <AppIcon name={c.icon} size={24} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-emerald-950">{c.title}</span>
              <span className="mt-1 block text-sm leading-snug text-emerald-700">{c.desc}</span>
            </span>
            <AppIcon name="chevron-right" size={20} className="mt-1 shrink-0 text-emerald-600" />
          </Link>
        ))}
      </div>
    </div>
  );
}
