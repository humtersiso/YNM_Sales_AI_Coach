"use client";

import { useState, type ReactNode } from "react";
import { cleanInlineMarkdown } from "@/lib/gemini/reply-format";
import {
  stripInlineCitationMarkers,
  type CitationCard,
} from "@/lib/gemini/citation-display";
import { CitationDetailSheet, CitationSourceNumbers } from "@/components/mobile/CitationPanel";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  bullets?: string[];
  pending?: boolean;
  citations?: CitationCard[];
  citationsOverflow?: number;
  allowAddRequest?: boolean;
  questionForAdd?: string;
  addRequestSubmitted?: boolean;
};

const MARKDOWN_BULLET_LINE = /^[-*•]\s+/;

/** 有獨立列點區時，正文勿再顯示 markdown 列點行 */
function introOnlyForDisplay(content: string, hasBullets: boolean): string {
  const t = content.trim();
  if (!hasBullets) return t;
  return t
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !MARKDOWN_BULLET_LINE.test(line))
    .join("\n")
    .trim();
}

function ThinkingBubble({ hint }: { hint?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[15px] text-emerald-800">
        <span>思考中</span>
        <span className="thinking-dots inline-flex gap-1" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </div>
      {hint ? <p className="text-[13px] leading-snug text-emerald-700/90">{hint}</p> : null}
    </div>
  );
}

function formatBulletLine(text: string): ReactNode {
  const plain = stripInlineCitationMarkers(cleanInlineMarkdown(text));
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
    <div className="mt-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
        列點
      </p>
      <ul className="list-none space-y-2.5 pl-0">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-[16px] leading-relaxed text-zinc-800">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" aria-hidden />
            <span className="whitespace-pre-line">
              {formatBulletLine(b)}
            </span>
          </li>
        ))}
      </ul>
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
  onOpenCitation,
}: {
  message: ChatMessage;
  onAddToBank?: (messageId: string, question: string) => Promise<void>;
  onOpenCitation: (id: number) => void;
}) {
  const [addBusy, setAddBusy] = useState(false);
  const {
    content,
    bullets,
    citations,
    citationsOverflow,
    allowAddRequest,
    questionForAdd,
    addRequestSubmitted,
  } = message;

  const hasBullets = Boolean(bullets && bullets.length > 0);
  const hasCitations = Boolean(citations && citations.length > 0);
  const introRaw = introOnlyForDisplay(
    typeof content === "string" && !content.includes("[object Object]") ? content : "",
    hasBullets,
  );
  const safeIntro =
    introRaw.trim().length > 0
      ? stripInlineCitationMarkers(cleanInlineMarkdown(introRaw))
      : "";
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
            <div className={hasBullets ? "mb-3" : undefined}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                小結
              </p>
              <p className="whitespace-pre-line text-[16px] leading-relaxed text-zinc-800">
                {safeIntro}
              </p>
            </div>
          ) : null}

          {hasBullets ? <BulletList bullets={bullets!} /> : null}

          {hasCitations ? (
            <CitationSourceNumbers
              citations={citations!}
              overflowCount={citationsOverflow ?? 0}
              onOpenCitation={onOpenCitation}
            />
          ) : null}
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
  const [activeCitation, setActiveCitation] = useState<{
    card: CitationCard;
  } | null>(null);

  function openCitation(id: number, fromMessage?: CitationCard[]) {
    const card = fromMessage?.find((c) => c.id === id);
    if (card) setActiveCitation({ card });
  }

  return (
    <>
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
                  ? "portal-chat-bubble-agent rounded-br-md"
                  : "portal-chat-bubble-customer rounded-bl-md shadow-sm"
              }`}
            >
              {m.pending ? (
                <ThinkingBubble
                  hint={(() => {
                    const citeLen = m.citations?.length ?? 0;
                    if (citeLen > 0) return `已找到 ${citeLen} 則來源，正在整理回覆…`;
                    const status = (m.content ?? "").trim();
                    if (status.includes("檢索") || status.includes("整理")) return status;
                    return undefined;
                  })()}
                />
              ) : m.role === "assistant" ? (
                <AssistantBubble
                  message={m}
                  onAddToBank={onAddToBank}
                  onOpenCitation={(id) => openCitation(id, m.citations)}
                />
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <CitationDetailSheet
        card={activeCitation?.card ?? null}
        onClose={() => setActiveCitation(null)}
      />
    </>
  );
}
