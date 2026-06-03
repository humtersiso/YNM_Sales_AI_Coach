"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";
import { PortalLayout } from "@/components/mobile/PortalLayout";

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <label className="block text-sm text-emerald-900">
      {label}
      <div className="relative mt-1">
        <input
          type={show ? "text" : "password"}
          className="no-native-password-toggle w-full rounded-xl border border-emerald-200 px-3 py-2.5 pr-11"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-emerald-700 hover:bg-emerald-50"
          aria-label={show ? "隱藏密碼" : "顯示密碼"}
        >
          {show ? <AppIcon name="eye-off" size={20} /> : <AppIcon name="eye" size={20} />}
        </button>
      </div>
    </label>
  );
}

export default function SalesChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("請完整填寫所有欄位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("新密碼與確認密碼不一致");
      return;
    }

    setBusy(true);
    setError("");
    const res = await fetch("/api/sales/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "更新密碼失敗");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <PortalLayout title="更新密碼" subtitle="首次登入請先變更密碼" backHref="/">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
        <PasswordField
          label="目前密碼"
          value={currentPassword}
          onChange={setCurrentPassword}
          placeholder="請輸入目前密碼"
          autoComplete="current-password"
        />
        <PasswordField
          label="新密碼"
          value={newPassword}
          onChange={setNewPassword}
          placeholder="至少 8 碼且包含英數"
          autoComplete="new-password"
        />
        <PasswordField
          label="確認新密碼"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="再次輸入新密碼"
          autoComplete="new-password"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-emerald-700 py-3 text-[15px] font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {busy ? "更新中..." : "更新密碼"}
        </button>
      </form>
    </PortalLayout>
  );
}
