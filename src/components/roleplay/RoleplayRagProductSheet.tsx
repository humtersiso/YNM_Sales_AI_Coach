"use client";

import { useEffect, useState } from "react";

type RagProductPayload = {
  ragConfigured: boolean;
  productCorpusReady: boolean;
  products: {
    id: string;
    displayName: string;
    ragReady: boolean;
    corpora: { category: string; label: string; ready: boolean; resourceHint: string }[];
  }[];
  corporaOverview: { category: string; label: string; ready: boolean; resourceHint: string }[];
};

export function RoleplayRagProductSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<RagProductPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void fetch("/api/roleplay/rag-products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j as RagProductPayload | null))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="關閉"
        onClick={onClose}
      />
      <div className="relative mx-auto max-h-[70dvh] w-full max-w-lg overflow-hidden rounded-t-2xl border border-emerald-100 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-emerald-100 px-4 py-3">
          <h2 className="text-lg font-semibold text-emerald-950">目標車型支援清單</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-emerald-700"
          >
            關閉
          </button>
        </div>
        <div className="max-h-[calc(70dvh-3rem)] overflow-y-auto px-4 py-3 text-sm">
          {loading ? (
            <p className="text-emerald-600">載入 RAG 語料狀態…</p>
          ) : !data?.productCorpusReady ? (
            <p className="text-amber-800">
              本品 RAG 語料庫尚未就緒（請確認環境變數 RAG_CORPUS_PRODUCT 等設定）。
            </p>
          ) : (
            <>
              <p className="mb-3 text-emerald-800">
                以下車型已接入銷售知識庫 RAG，對練時可引用話術與產品事實。
              </p>
              <ul className="space-y-3">
                {data.products.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-teal-100 bg-teal-50/40 p-3"
                  >
                    <p className="font-semibold text-emerald-950">{p.displayName}</p>
                    <ul className="mt-2 space-y-1 text-xs text-emerald-800">
                      {p.corpora.map((c) => (
                        <li key={c.category} className="flex justify-between gap-2">
                          <span>{c.label}</span>
                          <span className={c.ready ? "text-teal-700" : "text-amber-700"}>
                            {c.ready ? c.resourceHint : "未設定"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              {data.products.length === 0 ? (
                <p className="text-emerald-700">尚無已啟用的產品線。</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
