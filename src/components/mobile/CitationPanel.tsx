"use client";

import { useState, type ReactNode } from "react";
import {
  CITATION_EXCERPT_PREVIEW_CHARS,
  type CitationCard,
} from "@/lib/gemini/citation-display";

const CITATION_REF = /\[(\d{1,2})\]/g;

type Part = { type: "text"; value: string } | { type: "badge"; id: number };

function splitCitationMarkers(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(CITATION_REF)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ type: "text", value: text.slice(last, idx) });
    parts.push({ type: "badge", id: Number(m[1]) });
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text", value: text }];
}

export function CitationBadgeText({
  text,
  citations,
  onOpenCitation,
}: {
  text: string;
  citations?: CitationCard[];
  onOpenCitation: (id: number) => void;
}) {
  const parts = splitCitationMarkers(text);

  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.value}</span>;
        const card = citations?.find((c) => c.id === p.id);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onOpenCitation(p.id)}
            className="mx-0.5 inline-flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold leading-none text-white align-middle hover:bg-emerald-700"
            title={card ? `${card.title} ${card.page}` : `引用 ${p.id}`}
            aria-label={card ? `開啟引用 ${p.id}：${card.title}` : `引用 ${p.id}`}
          >
            {p.id}
          </button>
        );
      })}
    </>
  );
}

function ExcerptBody({ excerpt }: { excerpt: string }) {
  const [expanded, setExpanded] = useState(false);
  const limit = CITATION_EXCERPT_PREVIEW_CHARS;
  const long = excerpt.length > limit;
  const shown = expanded || !long ? excerpt : `${excerpt.slice(0, limit)}…`;

  return (
    <div>
      <pre className="mt-1 max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-[13px] leading-relaxed text-zinc-800">
        {shown || "（無摘錄）"}
      </pre>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm font-medium text-emerald-700 hover:text-emerald-900"
        >
          {expanded ? "收合" : "繼續閱讀"}
        </button>
      ) : null}
    </div>
  );
}

export function CitationDetailSheet({
  card,
  onClose,
}: {
  card: CitationCard | null;
  onClose: () => void;
}) {
  if (!card) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="citation-sheet-title"
      onClick={onClose}
    >
      <div
        className="max-h-[min(78dvh,520px)] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-xl pb-[env(safe-area-inset-bottom,0px)] sm:mx-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-zinc-300" />
        </div>
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2">
          <h3 id="citation-sheet-title" className="text-base font-semibold text-zinc-900">
            引用 [{card.id}]
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200"
          >
            關閉
          </button>
        </div>
        <div className="max-h-[50dvh] space-y-3 overflow-y-auto overscroll-contain px-4 py-4 text-sm">
          <div>
            <div className="text-xs font-medium text-zinc-500">引用來源</div>
            <div className="mt-0.5 font-medium text-emerald-900">{card.title}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-500">引用位置</div>
            <div className="mt-0.5 text-zinc-800">{card.page}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-500">原文</div>
            <ExcerptBody excerpt={card.excerpt} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatBulletWithCitations(
  text: string,
  citations: CitationCard[] | undefined,
  onOpenCitation: (id: number) => void,
): ReactNode {
  return (
    <CitationBadgeText text={text} citations={citations} onOpenCitation={onOpenCitation} />
  );
}

/** 文末引用來源：僅數字，點擊開詳情 */
export function CitationSourceNumbers({
  citations,
  overflowCount = 0,
  onOpenCitation,
}: {
  citations: CitationCard[];
  overflowCount?: number;
  onOpenCitation: (id: number) => void;
}) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-4 border-t border-emerald-100/80 pt-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
        引用來源
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {citations.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onOpenCitation(c.id)}
            className="flex h-11 w-11 items-center justify-center rounded-full active:bg-emerald-50"
            aria-label={`引用 ${c.id}：${c.title}`}
            title={c.title}
          >
            <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold leading-none text-white">
              {c.id}
            </span>
          </button>
        ))}
        {overflowCount > 0 ? (
          <span
            className="text-xs text-zinc-500"
            title={`另有 ${overflowCount} 則引用`}
          >
            +{overflowCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}
