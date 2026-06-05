"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import { RoleplayHistoryList } from "@/components/roleplay/RoleplayHistoryList";
import type { RoleplayHistoryItem } from "@/lib/roleplay/roleplay-types-api";

export default function RoleplayHistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<RoleplayHistoryItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const meRes = await fetch("/api/portal/auth/me", { cache: "no-store" });
      const salesRes = await fetch("/api/sales/auth/me", { cache: "no-store" });
      if (!meRes.ok && !salesRes.ok) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/roleplay/me/history?limit=20", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { items: RoleplayHistoryItem[] };
        setItems(data.items ?? []);
      }
      setReady(true);
    })();
  }, [router]);

  return (
    <PortalLayout title="歷史紀錄" subtitle="含未完成與完賽場次" backHref="/roleplay">
      {!ready ? (
        <p className="text-center text-sm text-emerald-600">載入中…</p>
      ) : (
        <RoleplayHistoryList items={items} />
      )}
    </PortalLayout>
  );
}
