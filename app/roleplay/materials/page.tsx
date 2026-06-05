"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 素材區已自導覽移除；保留路由供內部除錯時導回首頁 */
export default function RoleplayMaterialsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/roleplay");
  }, [router]);
  return null;
}
