"use client";

import { useEffect, useRef } from "react";
import { AppIcon } from "@/components/icons/AppIcon";

export type RoleplayUiMessage = {
  id: string;
  role: "customer" | "agent";
  content: string;
  pending?: boolean;
};

export function RoleplayPracticeChat({
  messages,
  turn,
  maxTurns,
  input,
  onInputChange,
  onSend,
  onFinish,
  busy,
  canFinish,
  error,
  waitingForAgent = false,
}: {
  messages: RoleplayUiMessage[];
  turn: number;
  maxTurns: number;
  input: string;
  onInputChange: (v: string) => void;
  onSend: (e: React.FormEvent) => void;
  onFinish: () => void;
  busy: boolean;
  canFinish: boolean;
  error: string;
  waitingForAgent?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex min-h-[50dvh] flex-col rounded-2xl border border-emerald-100 bg-white shadow-sm">
      <div className="border-b border-emerald-100 px-3 py-2">
        <p className="text-xs font-medium text-emerald-700">
          [Round {turn} / {maxTurns}]
          {turn >= maxTurns ? " · 請結束並評分" : ""}
        </p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {/* 業代先發提示卡 */}
        {waitingForAgent ? (
          <div className="mx-auto max-w-sm rounded-2xl border border-teal-200 bg-teal-50 px-4 py-4 text-center shadow-sm">
            <p className="text-sm font-semibold text-teal-900">情境已就緒，請先向客戶打招呼</p>
            <p className="mt-2 text-sm leading-relaxed text-teal-800">
              例如：「您好，在看這台車有什麼問題嗎？我都可以為您說明喔！」
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
                  ? "bg-emerald-700 text-white"
                  : "border border-emerald-100 bg-emerald-50/80 text-zinc-800"
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
      {error ? <p className="px-3 text-sm text-red-600">{error}</p> : null}
      <form onSubmit={onSend} className="border-t border-emerald-100 p-3 space-y-2">
        <textarea
          className="w-full resize-none rounded-xl border border-emerald-200 px-3 py-2.5 text-[15px] leading-snug"
          rows={3}
          placeholder={
            waitingForAgent
              ? "向客戶打招呼，開始對練…"
              : turn >= maxTurns
                ? "已達輪次上限"
                : "輸入你的回覆…"
          }
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          disabled={busy || turn >= maxTurns}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy || turn >= maxTurns || !input.trim()}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-700 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <AppIcon name="send" size={16} className="text-white" />
            {waitingForAgent ? "發起對話" : "送出"}
          </button>
          <button
            type="button"
            disabled={busy || !canFinish}
            onClick={onFinish}
            className="rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-medium text-teal-900 disabled:opacity-50"
          >
            結束評分
          </button>
        </div>
      </form>
    </div>
  );
}
