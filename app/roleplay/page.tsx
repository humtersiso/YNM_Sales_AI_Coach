import Link from "next/link";
import { AppIcon } from "@/components/icons/AppIcon";
import { PortalLayout } from "@/components/mobile/PortalLayout";

const hubItems = [
  {
    href: "/roleplay/materials",
    title: "素材區",
    desc: "瀏覽情境劇本 A～F 與銷售話術參考",
    icon: "book" as const,
    accent: "from-teal-600 to-emerald-600",
    available: true,
  },
  {
    href: "/roleplay/practice",
    title: "開始對練",
    desc: "選擇情境，最多 5 輪互動後取得評分與等級",
    icon: "play" as const,
    accent: "from-cyan-600 to-teal-600",
    available: true,
  },
];

export default function RoleplayHubPage() {
  return (
    <PortalLayout title="對練助手" subtitle="情境演練與話術練習" backHref="/">
      <p className="mb-4 text-sm leading-relaxed text-emerald-800">
        內建示範情境可供體驗；正式知識庫（KB-T33 範本）匯入後將自動替換。每場對練最多 5 輪，結束後顯示分數與 S～D 等級。
      </p>

      <ul className="space-y-3">
        {hubItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex items-start gap-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm transition hover:border-teal-200 hover:shadow-md"
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${item.accent} text-white shadow-sm`}
              >
                <AppIcon name={item.icon} size={24} className="text-white" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 className="text-lg font-semibold text-emerald-950 group-hover:text-teal-800">
                  {item.title}
                </h2>
                <p className="mt-1 text-sm leading-snug text-emerald-700">{item.desc}</p>
              </div>
              <AppIcon
                name="chevron-right"
                size={20}
                className="shrink-0 pt-1 text-emerald-500"
              />
            </Link>
          </li>
        ))}
      </ul>
    </PortalLayout>
  );
}
