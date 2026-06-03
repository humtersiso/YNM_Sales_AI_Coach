"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "@/components/icons/AppIcon";

const portals: {
  href: string;
  title: string;
  desc: string;
  icon: AppIconName;
  accent: string;
}[] = [
  {
    href: "/sales",
    title: "銷售助手",
    desc: "即時查詢話術・競品應對建議",
    icon: "message",
    accent: "from-emerald-600 to-teal-600",
  },
  {
    href: "/roleplay",
    title: "對練助手",
    desc: "情境演練與話術練習",
    icon: "target",
    accent: "from-teal-600 to-cyan-600",
  },
  {
    href: "/admin/home",
    title: "後台管理",
    desc: "資料維護・流程管理・使用統計",
    icon: "settings",
    accent: "from-emerald-700 to-green-800",
  },
];

export default function PortalHomePage() {
  const router = useRouter();
  const [role, setRole] = useState<"admin" | "agent" | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const roleBadge =
    role === "admin"
      ? {
          label: "管理者",
          className: "bg-violet-100 text-violet-800 border border-violet-200",
        }
      : role === "agent"
        ? {
            label: "用戶",
            className: "bg-emerald-100 text-emerald-800 border border-emerald-200",
          }
        : null;

  useEffect(() => {
    let mounted = true;
    async function checkSession() {
      const res = await fetch("/api/portal/auth/me", { cache: "no-store" });
      if (!mounted) return;
      if (!res.ok) {
        setRole(null);
        setDisplayName("");
        setCheckingSession(false);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        user?: { role?: "admin" | "agent"; displayName?: string };
      };
      setRole(data.user?.role ?? null);
      setDisplayName(data.user?.displayName ?? "");
      setCheckingSession(false);
    }
    checkSession().catch(() => {
      if (!mounted) return;
      setRole(null);
      setDisplayName("");
      setCheckingSession(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const cards = useMemo(
    () => {
      if (role === "admin") return portals;
      if (role === "agent") return portals.filter((p) => p.href !== "/admin/home");
      return [];
    },
    [role]
  );

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/portal/auth/logout", { method: "POST" });
    setRole(null);
    setDisplayName("");
    setCheckingSession(false);
    setLoggingOut(false);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="portal-shell min-h-dvh bg-[#f3fbf6]">
      <main className="portal-safe-bottom mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
        <header className="mb-10 text-center">
          <div className="flex items-start justify-between">
            <p className="text-sm font-medium tracking-wide text-emerald-700">裕日汽車</p>
            <div className="flex items-center gap-2">
              {roleBadge ? (
                <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${roleBadge.className}`}>
                  {roleBadge.label}
                  {displayName ? `｜${displayName}` : ""}
                </span>
              ) : null}
              {role ? (
                <button
                  type="button"
                  onClick={() => void logout()}
                  disabled={loggingOut}
                  className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                >
                  {loggingOut ? "登出中..." : "登出"}
                </button>
              ) : null}
            </div>
          </div>
          <h1 className="mt-6 text-2xl font-semibold text-emerald-950">銷售訓練平台</h1>
          <p className="mt-2 text-base text-emerald-800/90">請選擇要使用的服務</p>
        </header>

        {checkingSession ? (
          <div className="flex flex-1 flex-col gap-4">
            <div className="h-28 animate-pulse rounded-2xl border border-emerald-100 bg-white/70" />
            <div className="h-28 animate-pulse rounded-2xl border border-emerald-100 bg-white/70" />
            <div className="h-28 animate-pulse rounded-2xl border border-emerald-100 bg-white/70" />
          </div>
        ) : role ? (
          <div className="flex flex-1 flex-col gap-4">
            {cards.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="group block w-full rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-start gap-4">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${p.accent} text-white shadow-sm`}
                  >
                    <AppIcon name={p.icon} size={24} className="text-white" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h2 className="text-2xl font-semibold text-emerald-950 group-hover:text-emerald-800">{p.title}</h2>
                    <p className="mt-1 text-base leading-snug text-emerald-700">{p.desc}</p>
                  </div>
                  <AppIcon name="chevron-right" size={20} className="shrink-0 pt-1 text-emerald-500" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center">
            <div className="rounded-2xl border border-emerald-100 bg-white p-5 text-center shadow-sm">
              <p className="text-base text-emerald-800">請先登入以查看可使用功能</p>
              <Link
                href="/login"
                className="mt-4 inline-block rounded-xl bg-emerald-700 px-6 py-3 text-base font-medium text-white hover:bg-emerald-800"
              >
                前往登入
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
