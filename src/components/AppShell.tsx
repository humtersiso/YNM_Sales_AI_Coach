"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/admin/home", label: "主頁", hint: "使用統計・戰力・競品", icon: "⌂" },
  { href: "/admin", label: "資料總覽", hint: "主庫資料與摘要", icon: "▦" },
  { href: "/admin/inbox", label: "匯入與檢查", hint: "上傳檔案與重複比對", icon: "⤴" },
  { href: "/admin/clarification", label: "問題流程追蹤", hint: "專家回覆、法務與回寫", icon: "✎" },
];

function isNavActive(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  displayName,
}: {
  children: React.ReactNode;
  displayName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#f5faf7] text-zinc-900">
      <div className="flex min-h-screen w-full">
        <aside
          className={`${collapsed ? "w-[84px]" : "w-50"} shrink-0 overflow-hidden border-r border-emerald-100 bg-white/90 p-4 shadow-sm transition-[width] duration-200 ease-out`}
        >
          <div className={`mb-4 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
            <h1 className={`${collapsed ? "hidden" : "block"} text-lg font-semibold text-emerald-950`}>YNM 管理後台</h1>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-50"
              title={collapsed ? "展開側欄" : "收合側欄"}
            >
              {collapsed ? ">" : "<"}
            </button>
          </div>
          <p className={`${collapsed ? "hidden" : "mb-5 block"} text-xs text-emerald-700`}>依操作流程排序</p>
          <nav className="space-y-2">
            {navItems.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`block rounded-xl border px-3 py-2.5 ${
                    active
                      ? "border-emerald-300 bg-emerald-100/90 shadow-sm"
                      : "border-transparent text-emerald-900 hover:border-emerald-100 hover:bg-emerald-50/80"
                  }`}
                >
                  <p className={`flex items-center ${collapsed ? "justify-center" : "gap-1.5"} text-[13px] font-semibold`}>
                    <span className="text-emerald-700">{item.icon}</span>
                    {collapsed ? null : item.label}
                  </p>
                  <p className={`${collapsed ? "hidden" : "block"} text-xs text-emerald-700`}>{item.hint}</p>
                </Link>
              );
            })}
          </nav>
          <p className={`${collapsed ? "hidden" : "mt-6 block"} text-xs`}>
            <Link href="/" className="text-emerald-700 underline">
              返回行動入口
            </Link>
          </p>
        </aside>

        <section className="flex-1">
          <header className="sticky top-0 z-20 flex items-center justify-end border-b border-emerald-100 bg-white/95 px-6 py-3 backdrop-blur">
            <div className="flex items-center gap-3 text-sm">
              <Link href="/admin/experts" className="rounded-lg px-2 py-1 text-emerald-800 hover:bg-emerald-50">
                專家名單
              </Link>
              <Link href="/admin/users" className="rounded-lg px-2 py-1 text-emerald-800 hover:bg-emerald-50">
                用戶管理
              </Link>
              <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900">
                {displayName}
              </span>
              <button
                type="button"
                onClick={() => void logout()}
                disabled={busy}
                className="rounded-lg border border-emerald-300 px-2 py-1 text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
              >
                登出
              </button>
            </div>
          </header>
          <main className="w-full p-6">{children}</main>
        </section>
      </div>
    </div>
  );
}
