"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import {
  RoleplayPracticeChat,
  type RoleplayUiMessage,
} from "@/components/roleplay/RoleplayPracticeChat";
import { RoleplayScenarioPicker } from "@/components/roleplay/RoleplayScenarioPicker";
import type { RoleplayScenarioPublicView } from "@/lib/roleplay/scenario-contract";

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function RoleplayPracticePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [scenarios, setScenarios] = useState<RoleplayScenarioPublicView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [scenarioTitle, setScenarioTitle] = useState("");
  const [messages, setMessages] = useState<RoleplayUiMessage[]>([]);
  const [turn, setTurn] = useState(0);
  const [maxTurns, setMaxTurns] = useState(5);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"pick" | "chat">("pick");

  useEffect(() => {
    void (async () => {
      const meRes = await fetch("/api/portal/auth/me", { cache: "no-store" });
      const salesRes = await fetch("/api/sales/auth/me", { cache: "no-store" });
      if (!meRes.ok && !salesRes.ok) {
        router.replace("/login");
        return;
      }
      const listRes = await fetch("/api/roleplay/scenarios");
      const data = (await listRes.json()) as { scenarios?: RoleplayScenarioPublicView[] };
      setScenarios(data.scenarios ?? []);
      if (data.scenarios?.[0]) setSelectedId(data.scenarios[0].scenarioId);
      setReady(true);
    })();
  }, [router]);

  async function startPractice() {
    if (!selectedId || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/roleplay/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: selectedId }),
      });
      const data = (await res.json()) as {
        sessionId?: string;
        customerMessage?: string;
        maxTurns?: number;
        turn?: number;
        scenarioTitle?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "無法開始對練");
        return;
      }
      setSessionId(data.sessionId ?? "");
      setScenarioTitle(data.scenarioTitle ?? "");
      setMaxTurns(data.maxTurns ?? 5);
      setTurn(data.turn ?? 0);
      setMessages([
        {
          id: newId(),
          role: "customer",
          content: data.customerMessage ?? "",
        },
      ]);
      setPhase("chat");
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !sessionId || turn >= maxTurns) return;
    setInput("");
    setError("");
    const agentId = newId();
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
      setMessages((m) =>
        m.map((x) =>
          x.id === pendingId
            ? { id: pendingId, role: "customer", content: data.customerMessage ?? "" }
            : x,
        ),
      );
      if (data.shouldFinish) {
        setError("已完成 5 輪，請點「結束評分」");
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
    return (
      <PortalLayout title="開始對練" backHref="/roleplay">
        <p className="text-center text-sm text-emerald-600">載入中…</p>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="開始對練" subtitle={scenarioTitle || "選擇情境"} backHref="/roleplay">
      {phase === "pick" ? (
        <div className="space-y-4">
          <RoleplayScenarioPicker
            scenarios={scenarios}
            selectedId={selectedId}
            onSelect={setSelectedId}
            disabled={busy}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            disabled={busy || !selectedId}
            onClick={() => void startPractice()}
            className="w-full rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 py-3 text-[15px] font-medium text-white disabled:opacity-60"
          >
            {busy ? "準備中…" : "開始對練"}
          </button>
        </div>
      ) : (
        <RoleplayPracticeChat
          messages={messages}
          turn={turn}
          maxTurns={maxTurns}
          input={input}
          onInputChange={setInput}
          onSend={(e) => void send(e)}
          onFinish={() => void finish()}
          busy={busy}
          canFinish={turn >= 1}
          error={error}
        />
      )}
    </PortalLayout>
  );
}
