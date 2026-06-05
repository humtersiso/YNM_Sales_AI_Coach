"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import { RoleplayHomeDashboard } from "@/components/roleplay/RoleplayHomeDashboard";
import { RoleplayStickyActions } from "@/components/roleplay/RoleplayStickyActions";
import type { SessionUser } from "@/lib/auth/session";

export default function RoleplayHubPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    void (async () => {
      const portalRes = await fetch("/api/portal/auth/me", { cache: "no-store" });
      if (portalRes.ok) {
        const data = (await portalRes.json()) as { user?: SessionUser };
        if (data.user) {
          setUser(data.user);
          return;
        }
      }
      const salesRes = await fetch("/api/sales/auth/me", { cache: "no-store" });
      if (salesRes.ok) {
        const data = (await salesRes.json()) as { user?: SessionUser };
        setUser(data.user ?? null);
        return;
      }
      router.replace("/login");
    })();
  }, [router]);

  return (
    <PortalLayout
      title="對練助手"
      backHref="/"
      headerUser={
        user
          ? {
              branch: user.branch ?? "",
              displayName: user.displayName,
              role: user.role,
            }
          : undefined
      }
    >
      <div className="pb-28">
        <RoleplayHomeDashboard />
      </div>
      <RoleplayStickyActions />
    </PortalLayout>
  );
}
