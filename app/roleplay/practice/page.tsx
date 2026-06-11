"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { PortalLayout } from "@/components/mobile/PortalLayout";
import {
  RoleplayPracticeChat,
  deriveRoleplayPracticePhase,
  type RoleplayUiMessage,
} from "@/components/roleplay/RoleplayPracticeChat";
import { RoleplayScoringOverlay } from "@/components/roleplay/RoleplayScoringOverlay";
import type { RoleplayScoreResult } from "@/lib/roleplay/session-types";

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
  plannedCustomerOpening?: string;
  awaitingAgentClosing?: boolean;
  agentClosingSent?: boolean;
  readyToScore?: boolean;
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
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** 收尾已送出，可結束評分 */
  const [sessionEnded, setSessionEnded] = useState(false);
  const [waitingForAgent, setWaitingForAgent] = useState(false);
  /** 對話輪次已滿，等待業代收尾 */
  const [awaitingClosing, setAwaitingClosing] = useState(false);
  const [scenarioTitle, setScenarioTitle] = useState("");

  function applyBootstrap(data: PracticeBootstrap) {
    setSessionId(data.sessionId);
    setMaxTurns(data.maxTurns ?? 5);
    setTurn(data.turn ?? 0);
    setScenarioTitle(data.scenarioTitle?.trim() ?? "");

    const readyToScore = data.readyToScore ?? data.agentClosingSent ?? false;
    const needsClosing =
      !readyToScore &&
      (data.awaitingAgentClosing === true ||
        (data.turn ?? 0) >= (data.maxTurns ?? 5));

    setAwaitingClosing(needsClosing);
    setSessionEnded(readyToScore);

    if (data.agentSpeaksFirst) {
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

    if (needsClosing) {
      setNotice("本場對話輪次已結束，請向客戶收尾致謝後再結束評分。");
    } else if (readyToScore) {
      setNotice("收尾已完成，請點「結束評分」查看修正點與建議。");
    }
  }

  function applyTurnResponse(
    data: {
      customerMessage?: string;
      turn?: number;
      shouldFinish?: boolean;
      awaitingAgentClosing?: boolean;
      readyToScore?: boolean;
    },
    currentMaxTurns: number,
  ) {
    const nextTurn = data.turn ?? turn;
    setTurn(nextTurn);

    const readyToScore = !!data.readyToScore;
    const needsClosing =
      !!data.awaitingAgentClosing ||
      (nextTurn >= currentMaxTurns && !readyToScore);

    if (needsClosing && !readyToScore) {
      setAwaitingClosing(true);
      setSessionEnded(false);
      setNotice("本場對話輪次已結束，請向客戶收尾致謝後再結束評分。");
    }
    if (readyToScore) {
      setAwaitingClosing(false);
      setSessionEnded(true);
      setNotice("收尾已完成，請點「結束評分」查看修正點與建議。");
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
          if (data.status === "active") {
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
            plannedCustomerOpening?: string;
          };
          applyBootstrap({
            sessionId: urlSessionId,
            status: "active",
            maxTurns: boot.maxTurns ?? 5,
            turn: boot.turn ?? 0,
            agentSpeaksFirst: boot.agentSpeaksFirst ?? true,
            plannedCustomerOpening: boot.plannedCustomerOpening ?? boot.customerMessage,
            scenarioTitle: boot.scenarioTitle,
            messages: [],
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

  useEffect(() => {
    if (!ready || waitingForAgent || sessionEnded) return;
    if (turn >= maxTurns && !awaitingClosing) {
      setAwaitingClosing(true);
      setNotice("本場對話輪次已結束，請向客戶收尾致謝後再結束評分。");
    }
  }, [ready, turn, maxTurns, waitingForAgent, sessionEnded, awaitingClosing]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    const phase = deriveRoleplayPracticePhase({
      waitingForAgent,
      awaitingClosing,
      sessionEnded,
      turn,
      maxTurns,
    });
    const isClosingTurn = phase === "closing";
    if (!text || busy || scoring || !sessionId || phase === "ready_to_score") {
      return;
    }
    setInput("");
    setError("");
    setNotice("");
    const agentId = newId();
    const isFirstAgentTurn = waitingForAgent;

    setMessages((m) => [...m, { id: agentId, role: "agent", content: text }]);
    const pendingId = isClosingTurn ? null : newId();
    if (pendingId) {
      setMessages((m) => [
        ...m,
        { id: pendingId, role: "customer", content: "", pending: true },
      ]);
    }
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
        awaitingAgentClosing?: boolean;
        readyToScore?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "送出失敗");
        setMessages((m) =>
          m.filter((x) => x.id !== agentId && (pendingId ? x.id !== pendingId : true)),
        );
        setInput(text);
        return;
      }
      if (isFirstAgentTurn) setWaitingForAgent(false);
      if (pendingId) {
        setMessages((m) =>
          m.map((x) =>
            x.id === pendingId
              ? { id: pendingId, role: "customer", content: data.customerMessage ?? "" }
              : x,
          ),
        );
      }
      applyTurnResponse(data, maxTurns);
    } catch {
      setError("連線失敗");
      setMessages((m) =>
        m.filter((x) => x.id !== agentId && (pendingId ? x.id !== pendingId : true)),
      );
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!sessionId || busy || scoring || !sessionEnded) return;
    setScoring(true);
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/roleplay/sessions/${encodeURIComponent(sessionId)}/finish`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        error?: string;
        scoreResult?: RoleplayScoreResult;
      };
      if (!res.ok) {
        setError(data.error ?? "評分失敗");
        setScoring(false);
        return;
      }
      if (data.scoreResult) {
        sessionStorage.setItem(
          `roleplay-result-${sessionId}`,
          JSON.stringify({
            scenarioTitle,
            scoreResult: data.scoreResult,
          }),
        );
      }
      router.push(`/roleplay/result?sessionId=${encodeURIComponent(sessionId)}`);
    } catch {
      setError("連線失敗");
      setScoring(false);
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
    <>
      <RoleplayScoringOverlay active={scoring} />
      <RoleplayPracticeChat
        messages={messages}
        turn={turn}
        maxTurns={maxTurns}
        input={input}
        onInputChange={setInput}
        onSend={(e) => void send(e)}
        onFinish={() => void finish()}
        busy={busy}
        scoring={scoring}
        canFinish={sessionEnded && !waitingForAgent}
        error={error}
        notice={notice}
        sessionEnded={sessionEnded}
        waitingForAgent={waitingForAgent}
        awaitingClosing={awaitingClosing}
        scenarioTitle={scenarioTitle}
      />
    </>
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
