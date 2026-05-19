import Link from "next/link";
import type { ReactNode } from "react";

export function PortalLayout({
  title,
  subtitle,
  backHref = "/",
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="portal-shell min-h-dvh bg-[#f3fbf6] text-zinc-900">
      <header className="portal-safe-top sticky top-0 z-10 border-b border-emerald-100/80 bg-[#f3fbf6]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Link
            href={backHref}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-sm text-emerald-800"
            aria-label="返回"
          >
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-emerald-950">{title}</h1>
            {subtitle ? <p className="truncate text-xs text-emerald-700">{subtitle}</p> : null}
          </div>
        </div>
      </header>
      <main className="portal-safe-bottom mx-auto w-full max-w-lg px-4 py-4">{children}</main>
    </div>
  );
}
