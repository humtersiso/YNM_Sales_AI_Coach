"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/icons/AppIcon";

type UserRow = {
  userId: string;
  username: string;
  displayName: string;
  role: "admin" | "agent";
  branch: string;
  status: "active" | "disabled";
  tenureYears: number;
};

const COUNTY_OPTIONS = [
  "台北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "台中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "台南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "台東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

function isValidUsername(value: string) {
  return /^[A-Za-z0-9_]{3,32}$/.test(value.trim());
}

function uiRole(role: UserRow["role"]) {
  return role === "agent" ? "user" : "admin";
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    branch: "",
    role: "user" as "admin" | "user",
    tenureYears: 0,
  });
  const [createdInfo, setCreatedInfo] = useState<{ loginUrl: string; username: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<{ username: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");

  async function loadUsers() {
    const res = await fetch("/api/admin/users");
    const data = (await res.json().catch(() => ({}))) as { users?: UserRow[]; error?: string };
    if (!res.ok) {
      setError(data.error ?? "讀取使用者失敗");
      return;
    }
    setUsers(data.users ?? []);
  }

  useEffect(() => {
    void loadUsers();
    void (async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { user?: { username?: string } };
      if (data.user?.username) setMe({ username: data.user.username });
    })();
  }, []);

  async function create(e: React.FormEvent): Promise<boolean> {
    e.preventDefault();
    setBusy(true);
    setCreateError("");
    setCreatedInfo(null);
    const username = form.username.trim();
    const displayName = form.displayName.trim();
    const branch = form.branch.trim();
    const tenureYears = Number(form.tenureYears);
    if (!username || !displayName || !branch) {
      setBusy(false);
      setCreateError("帳號、姓名、據點不可空白");
      return false;
    }
    if (!isValidUsername(username)) {
      setBusy(false);
      setCreateError("帳號格式需為 3-32 碼英數或底線");
      return false;
    }
    if (!Number.isFinite(tenureYears) || tenureYears < 0 || tenureYears > 50) {
      setBusy(false);
      setCreateError("年資請填 0~50 之間的數字");
      return false;
    }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        username,
        displayName,
        branch,
        role: form.role === "user" ? "agent" : "admin",
        tenureYears,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      user?: UserRow;
      initialPassword?: string;
      loginUrl?: string;
    };
    setBusy(false);
    if (!res.ok || !data.user || !data.initialPassword || !data.loginUrl) {
      setCreateError(data.error ?? "建立使用者失敗");
      return false;
    }
    setCreatedInfo({
      loginUrl: data.loginUrl,
      username: data.user.username,
      password: data.initialPassword,
    });
    setForm({ username: "", displayName: "", branch: "", role: "user", tenureYears: 0 });
    await loadUsers();
    return true;
  }

  async function setUserStatus(userId: string, status: "active" | "disabled") {
    if (!userId) {
      setError("找不到使用者 ID，無法更新狀態");
      return;
    }
    const target = users.find((u) => u.userId === userId);
    if (status === "disabled" && target?.username && me?.username && target.username === me.username) {
      setError("不可停用目前登入中的管理員帳號");
      return;
    }
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "更新狀態失敗");
      return;
    }
    await loadUsers();
  }

  async function removeUser(userId: string, username: string) {
    if (!window.confirm(`確定要刪除帳號「${username}」？此動作無法復原。`)) return;
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "刪除使用者失敗");
      return;
    }
    if (createdInfo?.username === username) setCreatedInfo(null);
    await loadUsers();
  }

  async function resetPassword(userId: string) {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      user?: UserRow;
      initialPassword?: string;
      loginUrl?: string;
    };
    if (!res.ok || !data.user || !data.initialPassword || !data.loginUrl) {
      setError(data.error ?? "重設密碼失敗");
      return;
    }
    setCreatedInfo({
      loginUrl: data.loginUrl,
      username: data.user.username,
      password: data.initialPassword,
    });
  }

  async function copyText(text: string, label: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyMessage(`已複製${label}`);
      window.setTimeout(() => setCopyMessage(""), 1500);
    } catch {
      setError(`複製${label}失敗，請手動複製`);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-emerald-950">用戶管理</h2>
        <button
          type="button"
          onClick={() => {
            setError("");
            setCreateError("");
            setCreateOpen(true);
            setCopyMessage("");
          }}
          className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800"
        >
          新增用戶
        </button>
      </div>

      {createdInfo ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">已建立/重設，請立即分享（密碼僅顯示一次）</p>
          <p className="mt-2 text-xs leading-relaxed text-amber-800">
            連結僅預填帳號，不會自動登入。若您要親自測試，請先登出管理員或使用無痕視窗，再貼上密碼登入。
          </p>
          <p className="mt-2">帳號：{createdInfo.username}</p>
          <p>密碼：{createdInfo.password}</p>
          <p className="break-all">登入連結：{createdInfo.loginUrl}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded border border-amber-300 px-2 py-1"
              onClick={() =>
                void copyText(
                  `登入連結：${createdInfo.loginUrl}\n帳號：${createdInfo.username}\n密碼：${createdInfo.password}`,
                  "完整資訊",
                )
              }
            >
              一鍵複製
            </button>
          </div>
          {copyMessage ? <p className="mt-2 text-xs text-emerald-800">{copyMessage}</p> : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <ul className="space-y-3">
        {users.map((u) => (
          <li
            key={u.userId}
            className="rounded-xl border border-emerald-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-emerald-950">{u.displayName}</p>
                <p className="mt-0.5 text-xs text-emerald-800">@{u.username}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  u.status === "active"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {u.status === "active" ? "啟用" : "停用"}
              </span>
            </div>
            <p className="mt-2 text-xs text-emerald-700">
              {u.branch} · {uiRole(u.role)} · 年資 {u.tenureYears} 年
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                className="w-full rounded-lg border border-emerald-300 py-2 text-xs text-emerald-900"
                onClick={() => void resetPassword(u.userId)}
              >
                重設密碼
              </button>
              {u.status !== "disabled" ? (
                <button
                  type="button"
                  disabled={me?.username === u.username}
                  className="w-full rounded-lg border border-red-200 py-2 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void setUserStatus(u.userId, "disabled")}
                >
                  停用
                </button>
              ) : (
                <button
                  type="button"
                  className="w-full rounded-lg border border-emerald-300 py-2 text-xs text-emerald-700"
                  onClick={() => void setUserStatus(u.userId, "active")}
                >
                  啟用
                </button>
              )}
              <button
                type="button"
                disabled={me?.username === u.username}
                className="w-full rounded-lg border border-red-300 py-2 text-xs text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void removeUser(u.userId, u.username)}
              >
                刪除
              </button>
            </div>
          </li>
        ))}
      </ul>

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCreateOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              const ok = await create(e);
              if (ok) setCreateOpen(false);
            }}
            className="w-full max-w-xl rounded-2xl border border-emerald-100 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-emerald-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-emerald-950">新增用戶</h3>
              <button
                type="button"
                className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                onClick={() => setCreateOpen(false)}
                aria-label="關閉"
              >
                <AppIcon name="x" size={18} />
              </button>
            </div>
            <div className="grid gap-4 px-5 py-5">
              {createError ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p> : null}
              <label className="block text-sm text-emerald-900">
                帳號
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2"
                  placeholder="例如: user_01"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm text-emerald-900">
                姓名
                <input
                  className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2"
                  placeholder="請輸入姓名"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm text-emerald-900">
                據點（縣市）
                <select
                  className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2"
                  value={form.branch}
                  onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                  required
                >
                  <option value="">請選擇縣市</option>
                  {COUNTY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-emerald-900">
                  年資(年)
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2"
                    placeholder="0"
                    min={0}
                    max={50}
                    value={form.tenureYears}
                    onChange={(e) => setForm((f) => ({ ...f, tenureYears: Number(e.target.value || 0) }))}
                  />
                </label>
                <label className="block text-sm text-emerald-900">
                  角色
                  <select
                    className="mt-1 w-full rounded-lg border border-emerald-200 px-3 py-2"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "admin" | "user" }))}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-emerald-100 px-5 py-4">
              <button
                type="button"
                className="rounded border border-emerald-200 px-3 py-2 text-sm text-emerald-800"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={
                  busy ||
                  !form.username.trim() ||
                  !form.displayName.trim() ||
                  !form.branch.trim() ||
                  !isValidUsername(form.username) ||
                  !Number.isFinite(Number(form.tenureYears)) ||
                  Number(form.tenureYears) < 0 ||
                  Number(form.tenureYears) > 50
                }
                className="rounded bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {busy ? "建立中..." : "建立"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

