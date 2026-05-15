import { USERS } from "@/lib/auth/users";

export default function UsersPage() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-emerald-950">帳號清單</h2>
        <p className="mt-1 text-sm text-emerald-800">目前為靜態設定模式（Demo）。</p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
        <ul className="space-y-2 text-sm">
          {USERS.map((u) => (
            <li key={u.username} className="rounded-lg border border-emerald-100 px-3 py-2">
              帳號：<span className="font-semibold text-emerald-900">{u.username}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

