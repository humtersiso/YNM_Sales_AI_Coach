"use client";

import { useState, type ReactNode } from "react";
import { cleanInlineMarkdown, type ScriptCitation } from "@/lib/gemini/reply-format";
import {
  CITATION_SECTION_TITLE,
} from "@/lib/gemini/citation-labels";
import { AppIcon } from "@/components/icons/AppIcon";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  bullets?: string[];
  pending?: boolean;
  citations?: ScriptCitation[];
  allowAddRequest?: boolean;
  questionForAdd?: string;
  addRequestSubmitted?: boolean;
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

function formatBulletLine(text: string): ReactNode {
  const plain = cleanInlineMarkdown(text);
  const kw = plain.match(/^(建議|可強調|重點|可回覆|說明)([：:，,]?\s*)([\s\S]+)/);
  if (kw) {
    return (
      <>
        <span className="font-semibold text-emerald-900">{kw[1]}</span>
        {kw[2]}
        {kw[3]}
      </>
    );
  }
  const titled = plain.match(/^([^：:]{2,40})[：:]\s*([\s\S]+)/);
  if (titled) {
    return (
      <>
        <span className="font-semibold text-emerald-900">{titled[1]}</span>
        ：{titled[2]}
      </>
    );
  }
  return plain;
}

function BulletList({ bullets }: { bullets: string[] }) {
  if (bullets.length === 0) return null;
  return (
    <ul className="mt-2 list-none space-y-2.5 pl-0">
      {bullets.map((b, i) => (
        <li key={i} className="flex gap-2 text-[16px] leading-relaxed text-zinc-800">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" aria-hidden />
          <span className="whitespace-pre-line">{formatBulletLine(b)}</span>
        </li>
      ))}
    </ul>
  );
}

function CitationFootnotes({ citations }: { citations: ScriptCitation[] }) {
  return (
    <div className="mt-3 border-t border-emerald-100 pt-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-emerald-800">
        <span className="mr-0.5 inline-flex items-center gap-1">
          <AppIcon name="link" size={14} className="text-emerald-700" />
          {CITATION_SECTION_TITLE}
        </span>
        {citations.map((c) => (
          <span
            key={c.index}
            className="inline-flex max-w-full items-center rounded bg-emerald-50 px-2 py-0.5 text-[13px] leading-snug text-emerald-900 ring-1 ring-emerald-100"
            title={c.sourceLabel ?? "來源"}
          >
            <span className="mr-1 font-semibold text-emerald-700">{c.index}.</span>
            <span className="truncate">{c.question}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function AddToBankPrompt({
  question,
  submitted,
  busy,
  onSubmit,
}: {
  question: string;
  submitted: boolean;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3">
      <p className="text-[11px] text-amber-900/80 line-clamp-3">「{question}」</p>
      {submitted ? (
        <p className="mt-2 text-xs font-medium text-emerald-800">已送出，話術窗口將後續建檔。</p>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="mt-2.5 w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {busy ? "送出中…" : "加入待新增題庫清單"}
        </button>
      )}
    </div>
  );
}

function AssistantBubble({
  message,
  onAddToBank,
}: {
  message: ChatMessage;
  onAddToBank?: (messageId: string, question: string) => Promise<void>;
}) {
  const [addBusy, setAddBusy] = useState(false);
  const { content, bullets, citations, allowAddRequest, questionForAdd, addRequestSubmitted } = message;

  const safeIntro =
    typeof content === "string" && !content.includes("[object Object]")
      ? cleanInlineMarkdown(content)
      : "";
  const hasBullets = Boolean(bullets && bullets.length > 0);

  async function handleAdd() {
    if (!questionForAdd || !onAddToBank || addRequestSubmitted) return;
    setAddBusy(true);
    try {
      await onAddToBank(message.id, questionForAdd);
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <>
      {allowAddRequest ? (
        <p className="text-[16px] leading-relaxed text-zinc-800">{safeIntro}</p>
      ) : (
        <>
          {safeIntro ? (
            <div className={hasBullets ? "mb-2" : undefined}>
              {hasBullets ? (
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                  小結
                </p>
              ) : null}
              <p
                className={`whitespace-pre-line text-[16px] leading-relaxed ${
                  hasBullets ? "font-medium text-emerald-950" : "text-zinc-800"
                }`}
              >
                {safeIntro}
              </p>
            </div>
          ) : null}
          {bullets && bullets.length > 0 ? <BulletList bullets={bullets} /> : null}
          {citations && citations.length > 0 ? <CitationFootnotes citations={citations} /> : null}
        </>
      )}
      {allowAddRequest && questionForAdd ? (
        <AddToBankPrompt
          question={questionForAdd}
          submitted={Boolean(addRequestSubmitted)}
          busy={addBusy}
          onSubmit={() => void handleAdd()}
        />
      ) : null}
    </>
  );
}

export function ChatThread({
  messages,
  onAddToBank,
}: {
  messages: ChatMessage[];
  onAddToBank?: (messageId: string, question: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-1 py-2">
      {messages.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-emerald-200 bg-white/70 px-4 py-6 text-center text-sm text-emerald-800">
          試著問：「TERRITORY_YT負評影片 在哪裡? 還有相關的資訊有?」或「客戶擔心 X-TRAIL 油耗怎麼回？」
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
              <AssistantBubble message={m} onAddToBank={onAddToBank} />
            ) : (
              <p className="whitespace-pre-wrap">{m.content}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
