import Link from "next/link";

const portals = [
  {
    href: "/sales/login",
    title: "銷售助手",
    desc: "即時查詢話術・競品應對建議",
    icon: "💬",
    accent: "from-emerald-600 to-teal-600",
  },
  {
    href: "/roleplay",
    title: "對練助手",
    desc: "情境演練與話術練習",
    icon: "🎯",
    accent: "from-teal-600 to-cyan-600",
  },
  {
    href: "/admin/login",
    title: "後台管理",
    desc: "資料維護・流程管理・使用統計",
    icon: "⚙",
    accent: "from-emerald-700 to-green-800",
  },
];

export default function PortalHomePage() {
  return (
    <div className="portal-shell min-h-dvh bg-[#f3fbf6]">
      <main className="portal-safe-bottom mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-8">
        <header className="mb-8 text-center">
          <p className="text-xs font-medium tracking-wide text-emerald-700">裕日汽車</p>
          <h1 className="mt-2 text-2xl font-semibold text-emerald-950">銷售訓練平台</h1>
          <p className="mt-2 text-sm text-emerald-800/90">請選擇要使用的服務</p>
        </header>

        <div className="flex flex-1 flex-col gap-4">
          {portals.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="group block w-full rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex items-start gap-4">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${p.accent} text-xl text-white shadow-sm`}
                >
                  {p.icon}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2 className="text-lg font-semibold text-emerald-950 group-hover:text-emerald-800">{p.title}</h2>
                  <p className="mt-1 text-sm leading-snug text-emerald-700">{p.desc}</p>
                </div>
                <span className="pt-1 text-emerald-500">›</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
