"use client";

import { useState } from "react";
import type { ScriptCitation } from "@/lib/gemini/reply-format";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  citations?: ScriptCitation[];
};

function ThinkingBubble() {
  return (
    <div className="flex items-center gap-2 text-[15px] text-emerald-800">
      <span>思考中</span>
      <span className="thinking-dots inline-flex gap-1" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

function CitationFootnotes({ citations }: { citations: ScriptCitation[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const active = citations.find((c) => c.index === openIndex);

  return (
    <div className="mt-3 border-t border-emerald-100 pt-2">
      <div className="flex flex-wrap items-center gap-1 text-xs text-emerald-800">
        <span className="mr-0.5">引用話術來源</span>
        {citations.map((c) => (
          <button
            key={c.index}
            type="button"
            onClick={() => setOpenIndex((cur) => (cur === c.index ? null : c.index))}
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-semibold transition ${
              openIndex === c.index
                ? "bg-emerald-700 text-white"
                : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
            }`}
            aria-expanded={openIndex === c.index}
            aria-label={`引用來源 ${c.index}`}
          >
            {c.index}
          </button>
        ))}
      </div>
      {active ? (
        <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs leading-relaxed text-zinc-700">
          <p>
            <span className="font-medium text-emerald-900">客戶問：</span>
            {active.question}
          </p>
          <p className="mt-1.5">
            <span className="font-medium text-emerald-900">建議話術：</span>
            {active.script}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AssistantBubble({ content, citations }: { content: string; citations?: ScriptCitation[] }) {
  const safeContent =
    typeof content === "string" && !content.includes("[object Object]")
      ? content
      : "已為您整理回應重點，請點選下方編號查看完整話術來源。";

  return (
    <>
      <p className="whitespace-pre-wrap leading-relaxed">{safeContent}</p>
      {citations && citations.length > 0 ? <CitationFootnotes citations={citations} /> : null}
    </>
  );
}

export function ChatThread({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-1 py-2">
      {messages.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-emerald-200 bg-white/70 px-4 py-6 text-center text-sm text-emerald-800">
          試著問：「KICKS 跟 HR-V 油耗怎麼比？」或「客戶問為什麼沒有 LV2 怎麼回？」
        </div>
      ) : null}
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[15px] ${
              m.role === "user"
                ? "rounded-br-md bg-emerald-700 text-white"
                : "rounded-bl-md border border-emerald-100 bg-white text-zinc-800 shadow-sm"
            }`}
          >
            {m.pending ? (
              <ThinkingBubble />
            ) : m.role === "assistant" ? (
              <AssistantBubble content={m.content} citations={m.citations} />
            ) : (
              <p className="whitespace-pre-wrap">{m.content}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
