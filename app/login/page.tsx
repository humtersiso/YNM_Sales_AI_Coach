"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";

type LoginResponse = {
  error?: string;
  user?: {
    role?: "admin" | "agent";
    mustChangePassword?: boolean;
  };
};

type ExistingSession = {
  username: string;
  displayName: string;
  role: "admin" | "agent";
};

export default function UnifiedLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteUsername, setInviteUsername] = useState<string | null>(null);
  const [existingSession, setExistingSession] = useState<ExistingSession | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const u = params.get("u")?.trim() ?? "";
    if (u) {
      setUsername(u);
      setInviteUsername(u);
    }

    // 若返回快取頁面，避免停留在「登入中…」狀態
    const onPageShow = () => setBusy(false);
    window.addEventListener("pageshow", onPageShow);

    void (async () => {
      const res = await fetch("/api/portal/auth/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as {
        user?: ExistingSession;
      };
      if (!data.user) return;

      // 分享給新用戶的連結（?u=帳號）：勿因管理員已登入而導回首頁
      if (u) {
        setExistingSession(data.user);
        return;
      }

      window.location.replace("/");
    })();

    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  async function logoutForInvite() {
    setBusy(true);
    setError("");
    try {
      await fetch("/api/portal/auth/logout", { method: "POST" });
      setExistingSession(null);
    } catch {
      setError("登出失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("請輸入帳號與密碼");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as LoginResponse;
      if (!res.ok) {
        setError(data.error ?? "登入失敗");
        return;
      }

      const target =
        data.user?.role === "agent" && data.user?.mustChangePassword ? "/sales/change-password" : "/";
      window.location.assign(target);
    } catch {
      setError("登入失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="portal-shell flex min-h-screen items-center justify-center bg-emerald-50 px-4">
      <form onSubmit={submit} className="portal-shell w-full max-w-sm rounded-xl border border-emerald-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold text-emerald-900">平台登入</h1>
        {existingSession ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
            <p>
              您目前以 <span className="font-medium">{existingSession.displayName}</span>（@
              {existingSession.username}）登入中。
            </p>
            {inviteUsername ? (
              <p className="mt-1 text-amber-900">
                若要測試新帳號「{inviteUsername}」，請先登出再輸入下方密碼；或使用無痕視窗開啟此連結。
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void logoutForInvite()}
              className="mt-2 w-full rounded-lg border border-amber-300 bg-white py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-60"
            >
              登出並繼續
            </button>
          </div>
        ) : null}
        <label className="mb-2 block text-base text-emerald-900">
          帳號
          <input
            className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-3 text-base"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="mb-3 block text-base text-emerald-900">
          密碼
          <div className="relative mt-1">
            <input
              type={showPassword ? "text" : "password"}
              className="no-native-password-toggle w-full rounded-lg border border-emerald-200 px-3 py-3 pr-11 text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-emerald-700 hover:bg-emerald-50"
              aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
            >
              {showPassword ? (
                <AppIcon name="eye-off" size={20} />
              ) : (
                <AppIcon name="eye" size={20} />
              )}
            </button>
          </div>
        </label>
        {error ? <p className="mb-2 text-base text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-base font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {busy ? "登入中..." : "登入"}
        </button>
      </form>
    </main>
  );
}
