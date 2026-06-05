"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import {
  RoleplayPracticeChat,
  type RoleplayUiMessage,
} from "@/components/roleplay/RoleplayPracticeChat";

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type PracticeBootstrap = {
  sessionId: string;
  status: string;
  scenarioTitle?: string;
  maxTurns: number;
  turn: number;
  messages: RoleplayUiMessage[];
  agentSpeaksFirst?: boolean;
};

function PracticeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("sessionId") ?? "";
  const initRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<RoleplayUiMessage[]>([]);
  const [turn, setTurn] = useState(0);
  const [maxTurns, setMaxTurns] = useState(5);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 業代先發模式：等業代打招呼後才顯示 AI 客戶第一句
  const [waitingForAgent, setWaitingForAgent] = useState(false);

  function applyBootstrap(data: PracticeBootstrap) {
    setSessionId(data.sessionId);
    setMaxTurns(data.maxTurns ?? 5);
    setTurn(data.turn ?? 0);

    if (data.agentSpeaksFirst) {
      // 業代先發：messages 先留空，等第一輪 /turn 後才顯示客戶開場
      setMessages([]);
      setWaitingForAgent(true);
    } else {
      setMessages(
        data.messages.length > 0
          ? data.messages
          : [{ id: newId(), role: "customer", content: "" }],
      );
      setWaitingForAgent(false);
    }
  }

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    void (async () => {
      const meRes = await fetch("/api/portal/auth/me", { cache: "no-store" });
      const salesRes = await fetch("/api/sales/auth/me", { cache: "no-store" });
      if (!meRes.ok && !salesRes.ok) {
        router.replace("/login");
        return;
      }

      if (!urlSessionId) {
        router.replace("/roleplay");
        return;
      }

      try {
        const res = await fetch(
          `/api/roleplay/sessions/${encodeURIComponent(urlSessionId)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as PracticeBootstrap & {
            scoreResult?: unknown;
          };
          if (data.status === "finished") {
            router.replace(`/roleplay/result?sessionId=${encodeURIComponent(urlSessionId)}`);
            return;
          }
          if (data.status === "active" && data.messages?.length) {
            applyBootstrap(data);
            sessionStorage.removeItem(`roleplay-boot-${urlSessionId}`);
            setReady(true);
            return;
          }
        }
      } catch {
        // fallback sessionStorage
      }

      const raw = sessionStorage.getItem(`roleplay-boot-${urlSessionId}`);
      if (raw) {
        try {
          const boot = JSON.parse(raw) as {
            customerMessage?: string;
            maxTurns?: number;
            turn?: number;
            scenarioTitle?: string;
            agentSpeaksFirst?: boolean;
          };
          applyBootstrap({
            sessionId: urlSessionId,
            status: "active",
            maxTurns: boot.maxTurns ?? 5,
            turn: boot.turn ?? 0,
            agentSpeaksFirst: boot.agentSpeaksFirst ?? true,
            messages: [
              {
                id: newId(),
                role: "customer",
                content: boot.customerMessage ?? "",
              },
            ],
          });
          sessionStorage.removeItem(`roleplay-boot-${urlSessionId}`);
          setReady(true);
          return;
        } catch {
          // fall through
        }
      }

      setError("找不到對練場次，請重新開始");
      setReady(true);
    })();
  }, [router, urlSessionId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !sessionId || turn >= maxTurns) return;
    setInput("");
    setError("");
    const agentId = newId();
    const isFirstAgentTurn = waitingForAgent;

    setMessages((m) => [...m, { id: agentId, role: "agent", content: text }]);
    const pendingId = newId();
    setMessages((m) => [...m, { id: pendingId, role: "customer", content: "", pending: true }]);
    setBusy(true);

    try {
      const res = await fetch(`/api/roleplay/sessions/${encodeURIComponent(sessionId)}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json()) as {
        customerMessage?: string;
        turn?: number;
        shouldFinish?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "送出失敗");
        setMessages((m) => m.filter((x) => x.id !== pendingId && x.id !== agentId));
        return;
      }
      setTurn(data.turn ?? turn + 1);
      if (isFirstAgentTurn) setWaitingForAgent(false);
      setMessages((m) =>
        m.map((x) =>
          x.id === pendingId
            ? { id: pendingId, role: "customer", content: data.customerMessage ?? "" }
            : x,
        ),
      );
      if (data.shouldFinish) {
        setError(`已完成 ${maxTurns} 輪，請點「結束評分」`);
      }
    } catch {
      setError("連線失敗");
      setMessages((m) => m.filter((x) => x.id !== pendingId));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!sessionId || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/roleplay/sessions/${encodeURIComponent(sessionId)}/finish`,
        { method: "POST" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "評分失敗");
        return;
      }
      router.push(`/roleplay/result?sessionId=${encodeURIComponent(sessionId)}`);
    } catch {
      setError("連線失敗");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return <p className="text-center text-sm text-emerald-600">載入演練…</p>;
  }

  if (!sessionId) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-red-600">{error || "無法載入場次"}</p>
        <button
          type="button"
          onClick={() => router.push("/roleplay/setup")}
          className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white"
        >
          回到情境設定
        </button>
      </div>
    );
  }

  return (
    <RoleplayPracticeChat
      messages={messages}
      turn={turn}
      maxTurns={maxTurns}
      input={input}
      onInputChange={setInput}
      onSend={(e) => void send(e)}
      onFinish={() => void finish()}
      busy={busy}
      canFinish={turn >= 1 && !waitingForAgent}
      error={error}
      waitingForAgent={waitingForAgent}
    />
  );
}

export default function RoleplayPracticePage() {
  return (
    <PortalLayout title="演練模擬" subtitle="客戶由 AI 扮演" backHref="/roleplay/setup">
      <Suspense fallback={<p className="text-sm text-emerald-600">載入中…</p>}>
        <PracticeContent />
      </Suspense>
    </PortalLayout>
  );
}
