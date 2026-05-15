"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react";

type NodeKey = "notify" | "feedback" | "llm" | "marketing" | "legal" | "writeback";
type ActivePanel = { questionId: string; node: NodeKey } | null;

function cleanTitleText(text: string) {
  return text
    .replace(/^【[^】]*】/, "")
    .replace(/^【[^】]*】/, "")
    .trim();
}

export default function ClarificationPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingExpertId, setEditingExpertId] = useState<string | null>(null);
  const [editingExpertName, setEditingExpertName] = useState("");
  const [editingQuestionText, setEditingQuestionText] = useState("");
  const [editContent, setEditContent] = useState("");
  const [mailMsg, setMailMsg] = useState("");
  const [flowMsg, setFlowMsg] = useState("");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [notifySelection, setNotifySelection] = useState<Record<string, string[]>>({});
  const [marketingModal, setMarketingModal] = useState<{
    questionId: string;
    msdExpertId: string;
    questionTitle: string;
    text: string;
  } | null>(null);

  async function load() {
    const res = await fetch("/api/clarification");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "讀取失敗");
      return;
    }
    setData(json);
  }

  useEffect(() => {
    void (async () => {
      await fetch("/api/clarification", { method: "POST" }).catch(() => null);
      await load();
    })();
  }, []);

  useEffect(() => {
    if (!mailMsg) return;
    const t = setTimeout(() => setMailMsg(""), 3200);
    return () => clearTimeout(t);
  }, [mailMsg]);

  useEffect(() => {
    if (!flowMsg) return;
    const t = setTimeout(() => setFlowMsg(""), 3200);
    return () => clearTimeout(t);
  }, [flowMsg]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 4200);
    return () => clearTimeout(t);
  }, [error]);

  const progressByQuestion = useMemo(() => {
    const rows = (data?.progress ?? []) as Array<{
      questionId: string;
      answeredCount: number;
      total: number;
      status: "none" | "partial" | "complete";
    }>;
    return new Map(rows.map((x) => [x.questionId, x]));
  }, [data]);

  const questions = useMemo(() => (data?.questions ?? []) as any[], [data]);
  const workflowExperts = useMemo(
    () => ((data?.workflowExperts ?? []) as any[]).filter((x) => !x.isVirtual),
    [data],
  );
  const sortedQuestions = useMemo(() => {
    const demoCases = questions.filter((q) => String(q.source ?? "").startsWith("DemoCase-"));
    const sourceOrder = (q: any) => {
      const m = String(q.source ?? "").match(/^DemoCase-(\d+)$/);
      return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
    };
    function getStage(q: any) {
      const questionNotifications = ((data?.notifications ?? []) as any[]).filter((n) => n.questionId === q.id);
      const hasAnySuggestion = ((data?.suggestions ?? []) as any[]).some(
        (s) => s.questionId === q.id && String(s.content ?? "").trim(),
      );
      const notified = questionNotifications.length > 0 || hasAnySuggestion;
      const nonMsdExpertIds = workflowExperts.filter((ex: any) => ex.code !== "MSD").map((ex: any) => ex.id);
      const repliedExpertIds = new Set(
        ((data?.suggestions ?? []) as any[])
          .filter((s) => s.questionId === q.id && String(s.content ?? "").trim())
          .map((s) => s.expertId),
      );
      const feedbackDone = nonMsdExpertIds.length > 0 && nonMsdExpertIds.every((id: string) => repliedExpertIds.has(id));
      const msdExpert = workflowExperts.find((ex: any) => ex.code === "MSD");
      const msdReplied = Boolean(
        msdExpert
          && ((data?.suggestions ?? []) as any[]).find(
            (s) => s.questionId === q.id && s.expertId === msdExpert.id && String(s.content ?? "").trim(),
          ),
      );
      const legalStatus = q.legalStatus ?? "none";
      if (legalStatus === "approved") return 6;
      if (legalStatus !== "none" && msdReplied) return 5;
      if (msdReplied && legalStatus === "none") return 4;
      if (feedbackDone) return 3;
      if (notified) return 2;
      return 0;
    }
    const base = demoCases.length >= 6 ? demoCases : questions;
    return [...base].sort((a, b) => {
      const so = sourceOrder(a) - sourceOrder(b);
      if (so !== 0) return so;
      const stageDiff = getStage(a) - getStage(b);
      if (stageDiff !== 0) return stageDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [data, questions, workflowExperts]);

  async function saveSuggestion(questionId: string, expertId: string, content: string) {
    if (!content?.trim()) return;
    await fetch("/api/clarification/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, expertId, content }),
    });
    setEditingKey(null);
    setEditingQuestionId(null);
    setEditingExpertId(null);
    setEditingExpertName("");
    setEditingQuestionText("");
    setEditContent("");
    await load();
  }

  async function notifyExpertsByIds(questionId: string, expertIds: string[]) {
    if (!expertIds.length) {
      setError("請先勾選要通知的專家。");
      return;
    }
    const res = await fetch("/api/notify/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, expertIds }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "寄送失敗");
      return;
    }
    setMailMsg(`已發送提醒 ${expertIds.length} 位專家，題目ID：${questionId}`);
    await load();
  }

  async function notifyUnansweredExperts(questionId: string, unansweredExpertIds: string[]) {
    await notifyExpertsByIds(questionId, unansweredExpertIds);
  }

  async function notifySelectedExperts(questionId: string) {
    await notifyExpertsByIds(questionId, notifySelection[questionId] ?? []);
  }

  async function generateMsdSummary(questionId: string, msdExpertId: string, questionText: string) {
    const suggestions = ((data?.suggestions ?? []) as any[])
      .filter((s) => s.questionId === questionId)
      .map((s) => {
        const ex = workflowExperts.find((w) => w.id === s.expertId);
        return {
          expertCode: ex?.code ?? "",
          expertName: ex?.name ?? ex?.code ?? "專家",
          content: String(s.content ?? "").trim(),
        };
      })
      .filter((s) => s.content && s.expertCode !== "MSD");
    if (!suggestions.length) {
      setError("目前尚無可整合的專家回覆內容。");
      return false;
    }
    const llmRes = await fetch("/api/llm/msd-integrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: questionText, suggestions }),
    });
    const llmJson = await llmRes.json().catch(() => ({}));
    if (!llmRes.ok) {
      setError((llmJson as { error?: string }).error ?? "LLM整合失敗");
      return false;
    }
    const integratedContent = String((llmJson as { integrated?: string }).integrated ?? "").trim();
    if (!integratedContent) {
      setError("LLM 未回傳可用整合內容。");
      return false;
    }

    const saveRes = await fetch("/api/clarification/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, expertId: msdExpertId, content: integratedContent }),
    });
    const saveJson = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok) {
      setError((saveJson as { error?: string }).error ?? "MSD整合寫入失敗");
      return false;
    }
    setFlowMsg("已完成 LLM 整合並寫入 MSD 回覆。");
    await load();
    return true;
  }

  async function approveMarketingAndSendLegal(questionId: string) {
    const confirmed = window.confirm(
      "確認已由智慧行銷部審核通過？送出後會寄信給法務並建立審查連結。",
    );
    if (!confirmed) return;
    const sent = await sendToLegal(questionId);
    if (!sent) return;
    await notifyLegal(questionId);
    setFlowMsg("已送法務審查（已寄送法務通知）。");
    await load();
  }

  async function saveMarketingEditToMsd() {
    if (!marketingModal) return;
    const t = marketingModal.text.trim();
    if (!t) {
      setError("修改內容不可為空。");
      return;
    }
    const res = await fetch("/api/clarification/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionId: marketingModal.questionId,
        expertId: marketingModal.msdExpertId,
        content: t,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "儲存失敗");
      return;
    }
    setMarketingModal(null);
    setFlowMsg("已儲存修改。請按「批准」將內容送交法務。");
    await load();
  }

  async function sendToLegal(questionId: string) {
    const res = await fetch("/api/legal/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, decision: "pending_review" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "送法務失敗");
      return false;
    }
    setFlowMsg("已送法務審查。");
    await load();
    return true;
  }

  async function copyLegalLink(questionId: string) {
    const res = await fetch("/api/legal-review/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "建立法務連結失敗");
      return;
    }
    const path = (json as { urlPath?: string }).urlPath ?? "";
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setFlowMsg("已複製法務審查連結。");
    } catch {
      window.prompt("請手動複製法務審查連結：", url);
    }
  }

  async function notifyLegal(questionId: string) {
    const res = await fetch("/api/legal/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "寄送法務通知失敗");
      return;
    }
    setFlowMsg((json as { message?: string }).message ?? "已寄送法務通知。");
    await load();
  }

  async function writeBackApproved() {
    const confirmed = window.confirm("確認回寫已核准題目到主庫？");
    if (!confirmed) return;
    const res = await fetch("/api/excel/save", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((json as { error?: string }).error ?? "回寫主庫失敗");
      return;
    }
    setFlowMsg((json as { message?: string }).message ?? "已回寫主庫。");
    await load();
  }

  function closeEditor() {
    setEditingKey(null);
    setEditingQuestionId(null);
    setEditingExpertId(null);
    setEditingExpertName("");
    setEditingQuestionText("");
    setEditContent("");
  }

  function isNodeOpen(questionId: string, node: NodeKey) {
    return activePanel?.questionId === questionId && activePanel?.node === node;
  }

  function toggleNode(questionId: string, node: NodeKey, enabled: boolean) {
    if (!enabled) return;
    setActivePanel((prev) => {
      if (prev?.questionId === questionId && prev?.node === node) return null;
      return { questionId, node };
    });
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-emerald-950">✎ 問題流程追蹤</h2>
        <p className="mt-1 text-sm text-emerald-800">
          每題依序經過通知、回覆、LLM 整合、智慧行銷部審核、法務審查，最後回寫主庫。送法務須先於行銷節點「批准」。
        </p>
      </div>
      <div className="space-y-3">
        {sortedQuestions.map((q: any) => {
          const p = progressByQuestion.get(q.id);
          const questionNotifications = ((data?.notifications ?? []) as any[]).filter((n) => n.questionId === q.id);
          const hasAnySuggestion = ((data?.suggestions ?? []) as any[]).some(
            (s) => s.questionId === q.id && String(s.content ?? "").trim(),
          );
          const notified = questionNotifications.length > 0 || hasAnySuggestion;
          const nonMsdExpertIds = workflowExperts.filter((ex: any) => ex.code !== "MSD").map((ex: any) => ex.id);
          const repliedExpertIds = new Set(
            ((data?.suggestions ?? []) as any[])
              .filter((s) => s.questionId === q.id && String(s.content ?? "").trim())
              .map((s) => s.expertId),
          );
          const feedbackDone = nonMsdExpertIds.length > 0 && nonMsdExpertIds.every((id: string) => repliedExpertIds.has(id));
          const msdExpert = workflowExperts.find((ex: any) => ex.code === "MSD");
          const msdRepliedByMsd = Boolean(
            msdExpert
              && ((data?.suggestions ?? []) as any[]).find(
                (s) => s.questionId === q.id && s.expertId === msdExpert.id && String(s.content ?? "").trim(),
              ),
          );
          const msdReplied = msdRepliedByMsd;
          const legalStatus = q.legalStatus ?? "none";
          const legalSubmitted = legalStatus !== "none" && msdReplied;
          const legalApproved = legalStatus === "approved";
          const marketingDone = legalStatus !== "none";
          const canOpenNotify = true;
          const canOpenFeedback = notified;
          const canOpenLlm = feedbackDone;
          const canOpenMarketing = msdReplied;
          const canOpenLegal = legalSubmitted;
          const canOpenWriteback = legalApproved;
          const expertReplies = workflowExperts.map((ex: any) => {
            const existing = ((data?.suggestions ?? []) as any[]).find(
              (s) => s.questionId === q.id && s.expertId === ex.id,
            );
            return {
              ex,
              content: String(existing?.content ?? "").trim(),
            };
          });
          const unansweredExperts = expertReplies.filter((x: any) => !x.content).map((x: any) => x.ex.id);
          const llmSuggestionRaw = expertReplies.find((x: any) => x.ex.code === "MSD")?.content ?? "";
          const llmSuggestion = llmSuggestionRaw.replace(/^【LLM整合】\s*/u, "").trim();
          const workflowIntervalsDone =
            (notified ? 1 : 0)
            + (feedbackDone ? 1 : 0)
            + (msdReplied ? 1 : 0)
            + (marketingDone ? 1 : 0)
            + (legalApproved ? 1 : 0);
          const workflowProgressRatio = Math.min(workflowIntervalsDone, 5) / 5;
          return (
            <article key={q.id} className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-4xl">
                  <p className="text-sm font-semibold leading-6 text-emerald-950">{cleanTitleText(String(q.originalText ?? ""))}</p>
                  <p className="mt-1 text-[11px] text-zinc-600">回覆進度：{p?.answeredCount ?? 0}/{p?.total ?? 0}</p>
                </div>
                <div className="text-[11px] text-zinc-500">點節點可展開細節</div>
              </div>
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-1 py-3 sm:px-2">
                <div className="relative w-full pt-1 pb-3">
                  <div className="mx-4 relative h-[56px]">
                    {/* 軌道：節點 1 圓心到節點 6 圓心 */}
                    <div className="pointer-events-none absolute left-0 right-0 top-[15px] h-[2px] rounded-full bg-zinc-200" />
                    <div
                      className="pointer-events-none absolute left-0 top-[15px] h-[2px] rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
                      style={{ width: `${workflowProgressRatio * 100}%` }}
                    />
                    {[
                    { label: "通知專家", done: notified, key: "notify" as NodeKey, enabled: canOpenNotify },
                    { label: "專家回饋", done: feedbackDone, key: "feedback" as NodeKey, enabled: canOpenFeedback },
                    { label: "LLM整合", done: msdReplied, key: "llm" as NodeKey, enabled: canOpenLlm },
                    {
                      label: "智慧行銷部審核",
                      done: marketingDone,
                      key: "marketing" as NodeKey,
                      enabled: canOpenMarketing,
                    },
                    { label: "法務審查", done: legalApproved, key: "legal" as NodeKey, enabled: canOpenLegal },
                    { label: "回寫主庫", done: false, key: "writeback" as NodeKey, enabled: canOpenWriteback },
                  ].map((step, idx) => (
                    <div
                      key={step.label}
                      className="absolute top-0 z-10 w-[120px] -translate-x-1/2"
                      style={{ left: `${idx * 20}%` }}
                    >
                      <button
                        type="button"
                        disabled={!step.enabled}
                        onClick={() => toggleNode(q.id, step.key, step.enabled)}
                        className={`flex w-full flex-col items-center gap-1 ${step.enabled ? "" : "cursor-not-allowed"}`}
                      >
                        <span
                          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ring-4 ring-zinc-50 text-xs font-semibold shadow-sm ${
                            step.done
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-zinc-300 bg-white text-zinc-600"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <p
                          className={`min-h-[30px] w-full text-center text-[11px] leading-snug break-words ${
                            step.done ? "font-medium text-zinc-800" : "text-zinc-500"
                          }`}
                        >
                          {step.label}
                        </p>
                      </button>
                    </div>
                  ))}
                  </div>
                </div>
                {legalStatus === "approved" ? (
                  <p className="mt-2 text-[11px] text-emerald-700">法務已核准，可使用第 6 節點「回寫主庫」。</p>
                ) : legalStatus === "rejected" ? (
                  <p className="mt-2 text-[11px] text-red-700">法務已退回，請調整內容後再次送審。</p>
                ) : null}
              </div>
              {isNodeOpen(q.id, "notify") ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  {notified ? (
                    <p className="text-[11px] font-semibold text-emerald-800">已通知專家</p>
                  ) : (
                    <>
                      <p className="mb-2 text-[11px] font-semibold text-amber-900">通知專家（可勾選未回覆名單）</p>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {expertReplies
                          .filter((x: any) => !x.content)
                          .map(({ ex }: any) => {
                            const selected = (notifySelection[q.id] ?? []).includes(ex.id);
                            return (
                              <label key={ex.id} className="flex items-center gap-2 rounded border border-amber-200 bg-white px-2 py-1 text-[11px]">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={(e) => {
                                    setNotifySelection((prev) => {
                                      const cur = prev[q.id] ?? [];
                                      return {
                                        ...prev,
                                        [q.id]: e.target.checked ? [...cur, ex.id] : cur.filter((id) => id !== ex.id),
                                      };
                                    });
                                  }}
                                />
                                <span>{ex.name || ex.code}</span>
                              </label>
                            );
                          })}
                      </div>
                      <div className="mt-2">
                        <button
                          className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-900 hover:bg-amber-100"
                          onClick={() => void notifySelectedExperts(q.id)}
                        >
                          寄送通知
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {isNodeOpen(q.id, "feedback") ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <button
                      className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] text-emerald-900 hover:bg-emerald-100"
                      onClick={() => void load()}
                    >
                      更新進度
                    </button>
                    <button
                      className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] text-amber-900 hover:bg-amber-100"
                      onClick={() => void notifyUnansweredExperts(q.id, unansweredExperts)}
                      disabled={unansweredExperts.length === 0}
                    >
                      重複寄信
                    </button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {expertReplies.map(({ ex, content }: any) => {
                      const key = `${q.id}_${ex.id}`;
                      return (
                        <div key={key} className="rounded-lg border border-emerald-100 bg-white p-2">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-emerald-900">{ex.name || ex.code}</span>
                            {content ? (
                              <button
                                className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-900 hover:bg-emerald-200"
                                onClick={() => {
                                  setEditingKey(key);
                                  setEditingQuestionId(q.id);
                                  setEditingExpertId(ex.id);
                                  setEditingExpertName(ex.name || ex.code || "專家");
                                  setEditingQuestionText(cleanTitleText(String(q.originalText ?? "")));
                                  setEditContent(content);
                                }}
                              >
                                已回覆
                              </button>
                            ) : (
                              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-900">
                                未回覆
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-3 min-h-[42px] text-[11px] leading-5 text-zinc-600">
                            {content || "尚未回覆內容"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {isNodeOpen(q.id, "llm") ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="mb-2 text-[11px] font-semibold text-emerald-900">LLM整合（Gemini Flash）</p>
                  <p className="mb-2 text-[10px] text-zinc-600">
                    此步驟僅產生建議文案；送交法務請至「智慧行銷部審核」節點操作。
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {msdExpert ? (
                      <>
                        <button
                          className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] text-emerald-900 hover:bg-emerald-100"
                          onClick={() => void generateMsdSummary(q.id, msdExpert.id, String(q.originalText ?? ""))}
                        >
                          生成回答建議
                        </button>
                      </>
                    ) : (
                      <p className="text-[11px] text-zinc-500">找不到 MSD 專家，無法寫入整合內容。</p>
                    )}
                  </div>
                  {llmSuggestion ? (
                    <div className="mt-2 rounded-lg border border-emerald-200 bg-white p-2 text-[11px] leading-5 text-zinc-700">
                      {llmSuggestion}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-zinc-500">尚未產生 LLM 建議內容。</p>
                  )}
                </div>
              ) : null}

              {isNodeOpen(q.id, "marketing") ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="mb-2 text-[11px] font-semibold text-emerald-950">智慧行銷部審核</p>
                  {!msdExpert ? (
                    <p className="text-[11px] text-zinc-500">找不到 MSD 欄位，無法審核 LLM 建議。</p>
                  ) : !msdReplied ? (
                    <p className="text-[11px] text-zinc-600">請先在「LLM整合」產生回答建議。</p>
                  ) : marketingDone ? (
                    <p className="text-[11px] text-emerald-900">
                      此題已送法務（審核中／已核准／已退回皆視為已離開行銷審核）。若法務退回後需重送，請洽管理員或後續流程處理。
                    </p>
                  ) : (
                    <>
                      <p className="mb-2 text-[10px] text-zinc-600">
                        可「批准」直接送法務，或「修改」編輯 LLM 文案後儲存，再按「批准」送法務。
                      </p>
                      <div className="mb-2 rounded-lg border border-emerald-200 bg-white p-2 text-[11px] leading-5 text-zinc-700">
                        {llmSuggestion || "（無內容）"}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-600 bg-emerald-600 px-2 py-1 text-[11px] text-white hover:bg-emerald-700"
                          onClick={() => void approveMarketingAndSendLegal(q.id)}
                        >
                          批准（送法務）
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] text-emerald-900 hover:bg-emerald-50"
                          onClick={() =>
                            setMarketingModal({
                              questionId: q.id,
                              msdExpertId: msdExpert.id,
                              questionTitle: cleanTitleText(String(q.originalText ?? "")),
                              text: llmSuggestion || llmSuggestionRaw.replace(/^【LLM整合】\s*/u, "").trim(),
                            })
                          }
                        >
                          修改
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {isNodeOpen(q.id, "legal") ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                  <p className="mb-2 text-[11px] font-semibold text-emerald-950">法務審查</p>
                  <p className="mb-2 text-[10px] text-zinc-600">
                    送件須由「智慧行銷部審核」批准後系統自動送出；此處可寄信、複製連結與檢視審核狀態。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50"
                      onClick={() => void notifyLegal(q.id)}
                      title="寄信給法務"
                      aria-label="寄信給法務"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M4 6h16v12H4z" />
                        <path d="m4 7 8 6 8-6" />
                      </svg>
                    </button>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50"
                      onClick={() => void copyLegalLink(q.id)}
                      title="複製連結"
                      aria-label="複製連結"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10 5" />
                        <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L14 19" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-zinc-700">
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={legalStatus === "pending_review"} disabled readOnly />
                      審核中
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={legalStatus === "approved"} disabled readOnly />
                      批准
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" checked={legalStatus === "rejected"} disabled readOnly />
                      駁回
                    </label>
                    {legalStatus === "rejected" ? (
                      <p className="pl-6 text-red-700">理由：{q.legalComments || "（未填寫）"}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {isNodeOpen(q.id, "writeback") ? (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="mb-2 text-[11px] font-semibold text-emerald-900">回寫主庫</p>
                  <div className="mb-2 rounded-lg border border-emerald-200 bg-white p-2 text-[11px] leading-5 text-zinc-700">
                    {llmSuggestion || "尚無 LLM 回答建議"}
                  </div>
                  <button
                    className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-[11px] text-emerald-900 hover:bg-emerald-100"
                    onClick={() => void writeBackApproved()}
                  >
                    回寫已核准題目到主庫
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {questions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-emerald-200 bg-white p-8 text-center text-sm text-zinc-500">
            目前沒有待釐清題目。
          </div>
        ) : null}
      </div>
      <p className="text-[11px] text-zinc-500">
        提示：首頁先看流程進度，需要細節時再展開「查看各專家回應」。
      </p>
      <div className="fixed bottom-4 right-4 z-50 flex w-[320px] flex-col gap-2">
        {mailMsg ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 shadow">
            {mailMsg}
          </div>
        ) : null}
        {flowMsg ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 shadow">
            {flowMsg}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
            {error}
          </div>
        ) : null}
      </div>
      {marketingModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/35 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-emerald-950">智慧行銷部 — 修改 LLM 建議</h3>
                <p className="text-xs text-emerald-800">題目：{marketingModal.questionTitle}</p>
              </div>
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                onClick={() => setMarketingModal(null)}
              >
                關閉
              </button>
            </div>
            <textarea
              value={marketingModal.text}
              onChange={(e) => setMarketingModal((m) => (m ? { ...m, text: e.target.value } : m))}
              className="h-44 w-full rounded-lg border border-emerald-200 p-2 text-[12px] leading-relaxed"
              placeholder="請編輯送交法務前的標準話術／建議回覆"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-zinc-300 px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50"
                onClick={() => setMarketingModal(null)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-emerald-700 px-3 py-1.5 text-[12px] text-white hover:bg-emerald-800"
                onClick={() => void saveMarketingEditToMsd()}
              >
                儲存修改
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editingKey && editingQuestionId && editingExpertId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/35 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-emerald-950">編輯專家回覆</h3>
                <p className="text-xs text-emerald-700">專家：{editingExpertName}</p>
              </div>
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                onClick={closeEditor}
              >
                關閉
              </button>
            </div>
            <p className="mb-2 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900">
              題目：{editingQuestionText}
            </p>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="h-36 w-full rounded-lg border border-emerald-200 p-2 text-[12px]"
              placeholder="請輸入專家回覆內容"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-zinc-300 px-3 py-1.5 text-[12px] text-zinc-700 hover:bg-zinc-50"
                onClick={closeEditor}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-emerald-700 px-3 py-1.5 text-[12px] text-white hover:bg-emerald-800"
                onClick={() => void saveSuggestion(editingQuestionId, editingExpertId, editContent)}
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

