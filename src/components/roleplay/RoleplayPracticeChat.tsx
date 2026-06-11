"use client";

import { useEffect, useRef } from "react";
import { AppIcon } from "@/components/icons/AppIcon";

export type RoleplayUiMessage = {
  id: string;
  role: "customer" | "agent";
  content: string;
  pending?: boolean;
};

export type RoleplayPracticePhase = "opening" | "dialogue" | "closing" | "ready_to_score";

export function deriveRoleplayPracticePhase(input: {
  waitingForAgent: boolean;
  awaitingClosing: boolean;
  sessionEnded: boolean;
  turn: number;
  maxTurns: number;
}): RoleplayPracticePhase {
  if (input.waitingForAgent) return "opening";
  if (input.sessionEnded) return "ready_to_score";
  if (input.awaitingClosing || input.turn >= input.maxTurns) return "closing";
  return "dialogue";
}

export function RoleplayPracticeChat({
  messages,
  turn,
  maxTurns,
  input,
  onInputChange,
  onSend,
  onFinish,
  busy,
  scoring = false,
  canFinish,
  error,
  notice = "",
  sessionEnded = false,
  waitingForAgent = false,
  awaitingClosing = false,
  scenarioTitle = "",
}: {
  messages: RoleplayUiMessage[];
  turn: number;
  maxTurns: number;
  input: string;
  onInputChange: (v: string) => void;
  onSend: (e: React.FormEvent) => void;
  onFinish: () => void;
  busy: boolean;
  scoring?: boolean;
  canFinish: boolean;
  error: string;
  notice?: string;
  sessionEnded?: boolean;
  waitingForAgent?: boolean;
  awaitingClosing?: boolean;
  scenarioTitle?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const phase = deriveRoleplayPracticePhase({
    waitingForAgent,
    awaitingClosing,
    sessionEnded,
    turn,
    maxTurns,
  });
  const inputLocked = busy || scoring || phase === "ready_to_score";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex min-h-[50dvh] flex-col rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <div className="border-b border-emerald-100 px-3 py-2">
        <p className="text-xs font-medium text-emerald-700">
          {phase === "opening"
            ? "開場（不計入輪次）"
            : phase === "closing"
              ? `[Round ${maxTurns} / ${maxTurns}] · 請收尾致謝`
              : phase === "ready_to_score"
                ? `[Round ${maxTurns} / ${maxTurns}] · 請結束並評分`
                : `[Round ${Math.min(turn + 1, maxTurns)} / ${maxTurns}]`}
        </p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {waitingForAgent ? (
          <div className="rounded-2xl border border-teal-200 bg-teal-50/80 px-4 py-3">
            {scenarioTitle ? (
              <p className="text-xs font-semibold text-teal-900">{scenarioTitle}</p>
            ) : null}
            <p className="mt-1 text-sm font-semibold text-teal-900">請先向客戶打招呼</p>
            <p className="mt-1.5 text-sm leading-relaxed text-teal-800">
              由您先開場，客戶會依您的招呼開始回應。
            </p>
            <p className="mt-2 rounded-lg border border-teal-100 bg-white/70 px-3 py-2 text-sm leading-relaxed text-teal-950">
              例：「您好，在看這台車嗎？有什麼想了解的都可以問我喔！」
            </p>
          </div>
        ) : null}
        {phase === "closing" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
            <p className="text-sm font-semibold text-amber-950">請向客戶收尾致謝</p>
            <p className="mt-1.5 text-sm leading-relaxed text-amber-900">
              本場對話輪次已結束，請再送一則收尾（例如感謝來店、邀約試乘），完成後才能結束評分。
            </p>
            <p className="mt-2 rounded-lg border border-amber-100 bg-white/70 px-3 py-2 text-sm leading-relaxed text-amber-950">
              例：「今天謝謝您，有任何問題歡迎再找我，方便時也可以安排試乘體驗！」
            </p>
          </div>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "agent" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-3 py-2 text-[15px] leading-relaxed ${
                m.role === "agent"
                  ? "portal-chat-bubble-agent"
                  : "portal-chat-bubble-customer"
              }`}
            >
              {m.pending ? (
                <span className="text-emerald-100">客戶思考中…</span>
              ) : (
                <span className="whitespace-pre-line">{m.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {notice ? (
        <p className="px-3 text-sm text-teal-800 bg-teal-50/80 border-t border-teal-100 py-2">
          {notice}
        </p>
      ) : null}
      {error ? <p className="px-3 text-sm text-red-600">{error}</p> : null}
      <form onSubmit={onSend} className="border-t border-emerald-100 p-3 space-y-2">
        <textarea
          className="w-full resize-none rounded-xl border border-emerald-200 px-3 py-2.5 text-[15px] leading-snug disabled:bg-zinc-50"
          rows={3}
          placeholder={
            phase === "opening"
              ? "向客戶打招呼，開始對練…"
              : phase === "closing"
                ? "向客戶收尾致謝…"
                : phase === "ready_to_score"
                  ? "收尾已完成，請點「結束評分」"
                  : "輸入你的回覆…"
          }
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          disabled={inputLocked}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={inputLocked || !input.trim()}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-700 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <AppIcon name="send" size={16} className="text-white" />
            {phase === "opening" ? "發起對話" : phase === "closing" ? "送出收尾" : "送出"}
          </button>
          <button
            type="button"
            disabled={busy || scoring || !canFinish}
            onClick={onFinish}
            className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-medium text-teal-900 disabled:opacity-50"
          >
            {scoring ? "評分中…" : "結束評分"}
          </button>
        </div>
      </form>
    </div>
  );
}
