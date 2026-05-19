"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import { isValidSalesPassword } from "@/lib/sales/auth";
import { writeSalesSession } from "@/lib/sales/session";

export default function SalesLoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("請輸入業代姓名");
      return;
    }
    if (!isValidSalesPassword(password)) {
      setError("密碼錯誤，請重新輸入");
      return;
    }
    writeSalesSession({
      name: name.trim(),
      branch: branch.trim() || undefined,
      loggedInAt: new Date().toISOString(),
    });
    router.replace("/sales");
  }

  return (
    <PortalLayout title="銷售助手" subtitle="話術查詢・競品應對" backHref="/">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <label className="block text-sm text-emerald-900">
          業代姓名
          <input
            className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="請輸入姓名"
            autoComplete="name"
          />
        </label>
        <label className="block text-sm text-emerald-900">
          據點（選填）
          <input
            className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2.5"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="例：台北一區"
            autoComplete="organization"
          />
        </label>
        <label className="block text-sm text-emerald-900">
          密碼
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-emerald-200 px-3 py-2.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="請輸入密碼"
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          className="w-full rounded-xl bg-emerald-700 py-3 text-[15px] font-medium text-white hover:bg-emerald-800"
        >
          登入
        </button>
      </form>
    </PortalLayout>
  );
}
