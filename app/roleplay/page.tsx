import Link from "next/link";
import { PortalLayout } from "@/components/mobile/PortalLayout";

export default function RoleplayStubPage() {
  return (
    <PortalLayout title="對練助手" subtitle="即將上線" backHref="/">
      <div className="rounded-2xl border border-emerald-100 bg-white p-6 text-center shadow-sm">
        <p className="text-4xl">🎯</p>
        <h2 className="mt-4 text-lg font-semibold text-emerald-950">對練助手準備中</h2>
        <p className="mt-3 text-sm leading-relaxed text-emerald-800">
          情境對練功能正在建置，完成後將與銷售助手共用話術資料，支援模擬客戶互動與練習評分。
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-800"
        >
          返回首頁
        </Link>
      </div>
    </PortalLayout>
  );
}
