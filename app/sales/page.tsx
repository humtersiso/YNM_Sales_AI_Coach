"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChatThread, type ChatMessage } from "@/components/mobile/ChatThread";
import type { ScriptCitation } from "@/lib/gemini/reply-format";
import type { SessionUser } from "@/lib/auth/session";

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const INPUT_PLACEHOLDER = "例如 X-TRAIL 話術、Territory 對戰、ProPILOT、媒體亮點…";

export default function SalesChatPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadMe() {
      const meRes = await fetch("/api/sales/auth/me");
      if (!meRes.ok) {
        router.replace("/login");
        return;
      }
      const data = (await meRes.json()) as { user?: SessionUser };
      setSession(data.user ?? null);
      setReady(true);
    }
    void loadMe();
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
      const useStream = true;
      const endpoint = useStream ? "/api/sales/chat/stream" : "/api/sales/chat";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!useStream) {
        const data = (await res.json()) as {
          reply?: string;
          error?: string;
          bullets?: string[];
          citations?: ScriptCitation[];
          allowAddRequest?: boolean;
          question?: string;
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
                  bullets: data.bullets,
                  citations: data.citations,
                  allowAddRequest: data.allowAddRequest,
                  questionForAdd: data.allowAddRequest ? (data.question ?? text) : undefined,
                }
              : x,
          ),
        );
        return;
      }

      if (!res.ok || !res.body) {
        setError("查詢失敗，請稍後再試");
        setMessages((m) => m.filter((x) => x.id !== pendingId));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: {
            type?: string;
            text?: string;
            message?: string;
            result?: {
              reply?: string;
              bullets?: string[];
              citations?: ScriptCitation[];
              allowAddRequest?: boolean;
              question?: string;
            };
          };
          try {
            event = JSON.parse(line) as typeof event;
          } catch {
            continue;
          }

          if (event.type === "status") {
            setMessages((m) =>
              m.map((x) =>
                x.id === pendingId
                  ? { ...x, role: "assistant", content: event.text ?? "處理中…", pending: true }
                  : x,
              ),
            );
          } else if (event.type === "intro_delta" && event.text) {
            setMessages((m) =>
              m.map((x) =>
                x.id === pendingId
                  ? {
                      ...x,
                      role: "assistant",
                      content: (x.content || "") + event.text,
                      pending: true,
                    }
                  : x,
              ),
            );
          } else if (event.type === "done" && event.result) {
            const r = event.result;
            setMessages((m) =>
              m.map((x) =>
                x.id === pendingId
                  ? {
                      id: pendingId,
                      role: "assistant",
                      content: r.reply ?? x.content ?? "",
                      bullets: r.bullets,
                      citations: r.citations,
                      allowAddRequest: r.allowAddRequest,
                      questionForAdd: r.allowAddRequest ? (r.question ?? text) : undefined,
                      pending: false,
                    }
                  : x,
              ),
            );
          } else if (event.type === "error") {
            setError(event.message ?? "查詢失敗");
            setMessages((m) => m.filter((msg) => msg.id !== pendingId));
          }
        }
      }
    } catch {
      setError("網路連線異常，請稍後再試");
      setMessages((m) => m.filter((x) => x.id !== pendingId));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddToBank(messageId: string, question: string) {
    if (!session) return;
    const res = await fetch("/api/sales/question-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        city: session.branch,
        agentName: session.displayName,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "無法加入待新增清單，請稍後再試");
      return;
    }
    setMessages((m) =>
      m.map((x) => (x.id === messageId ? { ...x, addRequestSubmitted: true } : x)),
    );
  }

  async function logout() {
    await fetch("/api/sales/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (!session || !ready) {
    return <div className="portal-shell min-h-dvh bg-[#f3fbf6]" />;
  }

  return (
    <div className="portal-shell flex min-h-dvh flex-col bg-[#f3fbf6]">
      <header className="portal-safe-top flex shrink-0 items-center justify-between border-b border-emerald-100/80 bg-[#f3fbf6]/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-emerald-950">銷售助手</h1>
          <p className="truncate text-sm text-emerald-700">
            {session.branch}
            {session.displayName ? ` · ${session.displayName}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a href="/" className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-sm text-emerald-800">
            首頁
          </a>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-sm text-emerald-800"
          >
            登出
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden px-3">
        <ChatThread messages={messages} onAddToBank={handleAddToBank} />
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
            placeholder={INPUT_PLACEHOLDER}
            className="flex-1 rounded-full border border-emerald-200 px-4 py-3 text-base outline-none focus:border-emerald-400"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-full bg-emerald-700 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
          >
            送出
          </button>
        </div>
      </form>
    </div>
  );
}
