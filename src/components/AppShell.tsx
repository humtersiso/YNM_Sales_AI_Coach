"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AppIcon, type AppIconName } from "@/components/icons/AppIcon";

const navItems: { href: string; label: string; icon: AppIconName }[] = [
  { href: "/admin/home", label: "主頁", icon: "home" },
  { href: "/admin/users", label: "用戶管理", icon: "users" },
];

function isNavActive(pathname: string, href: string) {
  if (href === "/admin/home") {
    return pathname === href || pathname.startsWith("/admin/usage");
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

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#f5faf7] text-zinc-900">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-emerald-100 bg-white/95 px-3 py-3 backdrop-blur">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-emerald-950">YNM 管理</h1>
          <p className="truncate text-sm text-emerald-700">{displayName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-emerald-700 underline"
          >
            <AppIcon name="external-link" size={14} />
            行動入口
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={busy}
            className="rounded-lg border border-emerald-300 px-2.5 py-1 text-xs text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
          >
            登出
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-3 py-4 pb-24">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-emerald-100 bg-white/95 backdrop-blur"
        aria-label="管理後台導航"
      >
        <div className="mx-auto flex max-w-lg">
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-sm ${
                  active ? "font-semibold text-emerald-800" : "text-emerald-600"
                }`}
              >
                <AppIcon
                  name={item.icon}
                  size={22}
                  className={active ? "text-emerald-800" : "text-emerald-600"}
                />
                <span>{item.label}</span>
                {active ? (
                  <span className="mt-0.5 h-0.5 w-8 rounded-full bg-emerald-700" aria-hidden />
                ) : (
                  <span className="mt-0.5 h-0.5 w-8" aria-hidden />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
