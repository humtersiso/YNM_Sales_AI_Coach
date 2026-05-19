"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChatThread, type ChatMessage } from "@/components/mobile/ChatThread";
import type { ScriptCitation } from "@/lib/gemini/reply-format";
import { clearSalesSession, readSalesSession } from "@/lib/sales/session";

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function SalesChatPage() {
  const router = useRouter();
  const [session, setSession] = useState<ReturnType<typeof readSalesSession>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = readSalesSession();
    if (!s) {
      router.replace("/sales/login");
      return;
    }
    setSession(s);
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    const userMsg: ChatMessage = { id: newId(), role: "user", content: text };
    const pendingId = newId();
    setMessages((m) => [...m, userMsg, { id: pendingId, role: "assistant", content: "", pending: true }]);
    setBusy(true);
    try {
      const res = await fetch("/api/sales/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: session?.name }),
      });
      const data = (await res.json()) as {
        reply?: string;
        error?: string;
        citations?: ScriptCitation[];
      };
      if (!res.ok) {
        setError(data.error ?? "查詢失敗，請稍後再試");
        setMessages((m) => m.filter((x) => x.id !== pendingId));
        return;
      }
      setMessages((m) =>
        m.map((x) =>
          x.id === pendingId
            ? {
                id: pendingId,
                role: "assistant",
                content: data.reply ?? "暫時無法產生回覆，請換個方式提問。",
                citations: data.citations,
              }
            : x,
        ),
      );
    } catch {
      setError("網路連線異常，請稍後再試");
      setMessages((m) => m.filter((x) => x.id !== pendingId));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearSalesSession();
    router.replace("/sales/login");
  }

  if (!session) {
    return <div className="portal-shell min-h-dvh bg-[#f3fbf6]" />;
  }

  return (
    <div className="portal-shell flex min-h-dvh flex-col bg-[#f3fbf6]">
      <header className="portal-safe-top flex shrink-0 items-center justify-between border-b border-emerald-100/80 bg-[#f3fbf6]/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-emerald-950">銷售助手</h1>
          <p className="truncate text-xs text-emerald-700">
            {session.name}
            {session.branch ? ` · ${session.branch}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a href="/" className="rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-800">
            首頁
          </a>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-800"
          >
            登出
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden px-3">
        <ChatThread messages={messages} />
        <div ref={bottomRef} aria-hidden />
        {error ? <p className="px-1 pb-1 text-center text-xs text-red-600">{error}</p> : null}
      </div>

      <form
        onSubmit={send}
        className="portal-safe-bottom shrink-0 border-t border-emerald-100 bg-white/95 px-3 py-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-lg gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="輸入客戶問題或競品比較…"
            className="flex-1 rounded-full border border-emerald-200 px-4 py-2.5 text-[15px] outline-none focus:border-emerald-400"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            送出
          </button>
        </div>
      </form>
    </div>
  );
}
