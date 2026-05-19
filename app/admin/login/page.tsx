"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("YLG_001");
  const [password, setPassword] = useState("1111");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError((data as { error?: string }).error ?? "登入失敗");
      return;
    }
    router.replace("/admin/home");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-50">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-lg font-semibold text-emerald-900">後台管理登入</h1>
        <p className="mb-4 text-xs text-emerald-700">
          <a href="/" className="underline">
            返回入口首頁
          </a>
        </p>
        <label className="mb-2 block text-sm text-emerald-900">
          帳號
          <input className="mt-1 w-full rounded border border-emerald-200 px-3 py-2" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="mb-3 block text-sm text-emerald-900">
          密碼
          <input type="password" className="mt-1 w-full rounded border border-emerald-200 px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <button type="submit" disabled={busy} className="w-full rounded bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-800 disabled:opacity-60">
          {busy ? "登入中..." : "登入"}
        </button>
      </form>
    </main>
  );
}

