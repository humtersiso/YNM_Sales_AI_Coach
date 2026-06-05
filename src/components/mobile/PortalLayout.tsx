import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import type { AppRole } from "@/lib/auth/session";

const ROLE_STYLES: Record<AppRole, { label: string; className: string }> = {
  admin: {
    label: "管理者",
    className: "bg-violet-100 text-violet-800 border-violet-200",
  },
  agent: {
    label: "業務",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
};

export function PortalLayout({
  title,
  subtitle,
  backHref = "/",
  headerUser,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  /** 與銷售助手相同：分店 · 姓名，並顯示角色標籤 */
  headerUser?: { branch: string; displayName: string; role: AppRole };
  children: ReactNode;
}) {
  const roleMeta = headerUser ? ROLE_STYLES[headerUser.role] : null;

  return (
    <div className="portal-shell min-h-dvh bg-[#f3fbf6] text-zinc-900">
      <header className="portal-safe-top sticky top-0 z-10 border-b border-emerald-100/80 bg-[#f3fbf6]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Link
            href={backHref}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-800"
            aria-label="返回"
          >
            <AppIcon name="arrow-left" size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-emerald-950">{title}</h1>
            {headerUser ? (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm text-emerald-700">
                  {headerUser.branch}
                  {headerUser.displayName ? ` · ${headerUser.displayName}` : ""}
                </p>
                {roleMeta ? (
                  <span
                    className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${roleMeta.className}`}
                  >
                    {roleMeta.label}
                  </span>
                ) : null}
              </div>
            ) : subtitle ? (
              <p className="truncate text-sm text-emerald-700">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </header>
      <main className="portal-safe-bottom mx-auto w-full max-w-lg px-4 py-4">{children}</main>
    </div>
  );
}
