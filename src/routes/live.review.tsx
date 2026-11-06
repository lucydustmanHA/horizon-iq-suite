import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Star, Save, Plus, Trash2, Link2, Paperclip, CheckSquare, Square } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { OwnerAvatar, StageBadge } from "../components/badges";
import { usePortfolio } from "../lib/store";
import type { LiveMetric, LiveMonitoring, LiveReview } from "../lib/live-mock-data";
import { RAG_OPTIONS, METRIC_UNITS, ROLLUP_OPTIONS, CADENCE_OPTIONS } from "../lib/live-mock-data";
import { $getMonitoring, $upsertMonitoring, $getMetrics, $addMetric, $updateMetric, $deleteMetric, $getReview, $upsertReview, $loadLiveCases, $getReviewMonths } from "../lib/live.server";
import { REVIEW_CYCLE_OPTIONS, formatReviewKey, getCurrentReviewKey, normalizeReviewCycle, getMetricRollupValue, formatMetricValue, sortMetricPeriods } from "../lib/live-review-utils";
import { $getTodos, $addTodo, $updateTodo, $deleteTodo } from "../lib/use-cases.server";
import { NotesEditor } from "../components/notes-editor";
import { PostDeploymentSection, MetricsTab } from "../components/post-deployment-section";
import { $updateReviewCycle } from "../lib/live.server";
import type { LiveCaseSummary } from "../lib/live-mock-data";

export const Route = createFileRoute("/live/review")({
  component: ReviewCarousel,
  validateSearch: (search: Record<string, unknown>) => ({
    cycle: (search.cycle as string) || "Monthly",
    reviewKey: (search.reviewKey as string) || "",
  }),
});

function ReviewCarousel() {
  const navigate = useNavigate();
  const { cycle, reviewKey: reviewKeyParam } = Route.useSearch();
  const reviewKey = reviewKeyParam || getCurrentReviewKey(cycle);
  const allUseCases = usePortfolio((s) => s.useCases);
  const updateUseCase = usePortfolio((s) => s.updateUseCase);

  const [liveCases, setLiveCases] = useState<LiveCaseSummary[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const [monitoring, setMonitoring] = useState<LiveMonitoring | null>(null);
  const [metrics, setMetrics] = useState<LiveMetric[]>([]);
  const [review, setReview] = useState<LiveReview | null>(null);
  const [ragStatus, setRagStatus] = useState("green");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [comment, setComment] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  const [todos, setTodos] = useState<{id: string; text: string; done: boolean; assignee: string}[]>([]);
  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoAssignee, setNewTodoAssignee] = useState("");

  useEffect(() => {
    const normalizedCycle = normalizeReviewCycle(cycle);
    $loadLiveCases({ data: { reviewCycle: normalizedCycle } })
      .then((loadedCases) => {
        setLiveCases(loadedCases.filter((item) => !item.nonApplicable));
        setLoaded(true);
      })
      .catch((err) => { console.error(err); setLoaded(true); });
  }, [cycle]);

  const currentCase = liveCases[currentIdx];
  const currentUC = currentCase ? allUseCases.find((u) => u.id === currentCase.id) : null;

  useEffect(() => {
    if (!currentCase) return;
    const ucId = currentCase.id;
    Promise.all([
      $getMonitoring({ data: { useCaseId: ucId } }),
      $getMetrics({ data: { useCaseId: ucId } }),
      $getReview({ data: { useCaseId: ucId, reviewMonth: reviewKey, reviewCycle: normalizeReviewCycle(cycle) } }),
      $getTodos({ data: { useCaseId: ucId } }),
    ]).then(([mon, met, rev, td]) => {
      setMonitoring(mon);
      setMetrics(met);
      setReview(rev);
      setTodos(td);
      setRagStatus(rev?.ragStatus ?? "green");
      setMeetingNotes(rev?.meetingNotes ?? "");
      setComment(rev?.comment ?? "");
    }).catch(console.error);
  }, [currentCase?.id, reviewKey, cycle]);

  const saveReviewData = useCallback(async (overrides?: { ragStatus?: string; meetingNotes?: string; comment?: string }) => {
    if (!currentCase) return;
    setSavingReview(true);
    await $upsertReview({ data: {
      useCaseId: currentCase.id,
      reviewMonth: reviewKey,
      ragStatus: overrides?.ragStatus ?? ragStatus,
      meetingNotes: overrides?.meetingNotes ?? meetingNotes,
      comment: overrides?.comment ?? comment,
    } });
    setSavingReview(false);
  }, [currentCase, reviewKey, ragStatus, meetingNotes, comment]);

  const handleSetRag = (newRag: string) => {
    setRagStatus(newRag);
    if (currentCase) {
      $upsertReview({ data: { useCaseId: currentCase.id, reviewMonth: reviewKey, ragStatus: newRag, meetingNotes, comment } });
    }
  };

  const handleAddTodo = async () => {
    if (!currentCase || !newTodoText.trim()) return;
    await $addTodo({ data: { useCaseId: currentCase.id, text: newTodoText.trim(), assignee: newTodoAssignee.trim() } });
    const refreshed = await $getTodos({ data: { useCaseId: currentCase.id } });
    setTodos(refreshed);
    setNewTodoText("");
    setNewTodoAssignee("");
  };

  const handleToggleTodo = async (todoId: string, done: boolean) => {
    setTodos((prev) => prev.map((t) => t.id === todoId ? { ...t, done } : t));
    await $updateTodo({ data: { id: todoId, done } });
  };

  const handleDeleteTodo = async (todoId: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== todoId));
    await $deleteTodo({ data: { id: todoId } });
  };

  // Monitoring editing handlers
  const [monDesc, setMonDesc] = useState("");
  const [monCadence, setMonCadence] = useState("Weekly");
  const [monOwner, setMonOwner] = useState("");
  const [monSaving, setMonSaving] = useState(false);

  useEffect(() => {
    if (monitoring) {
      setMonDesc(monitoring.description);
      setMonCadence(monitoring.cadence);
      setMonOwner(monitoring.monitoringOwner);
    }
  }, [monitoring]);

  const saveMonitoring = async () => {
    if (!currentCase) return;
    setMonSaving(true);
    const updated = await $upsertMonitoring({ data: { useCaseId: currentCase.id, description: monDesc, tools: monitoring?.tools ?? [], cadence: monCadence, monitoringOwner: monOwner, approach: monitoring?.approach ?? "Proactive" } });
    setMonitoring(updated);
    setMonSaving(false);
  };

  const goNext = () => { saveReviewData(); if (currentIdx < liveCases.length - 1) setCurrentIdx(currentIdx + 1); };
  const goPrev = () => { saveReviewData(); if (currentIdx > 0) setCurrentIdx(currentIdx - 1); };
  const exit = () => { saveReviewData(); navigate({ to: "/live" }); };

  if (!loaded) return <div className="flex items-center justify-center h-screen"><p className="text-slate-400">Loading review…</p></div>;
  if (liveCases.length === 0) return (
    <div className="flex items-center justify-center h-screen flex-col gap-4">
      <p className="text-slate-500">No live use cases to review.</p>
      <Button variant="outline" onClick={exit}>Back to Live & Delivering</Button>
    </div>
  );

  const progress = ((currentIdx + 1) / liveCases.length) * 100;
  const starredMetrics = metrics.filter((m) => m.starred);
  const allPeriods = sortMetricPeriods(Array.from(new Set(metrics.flatMap((m) => Object.keys(m.periodValues)))));

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{cycle} Review</span>
            <span className="text-[10px] text-slate-500">· {formatReviewKey(reviewKey)}</span>
          </div>
          <p className="text-sm text-slate-700 font-medium">{currentIdx + 1} of {liveCases.length}</p>
        </div>
        <div className="flex-1 mx-8">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 transition-all rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <Button variant="ghost" size="sm" className="gap-1" onClick={exit}><X className="size-4" />Exit</Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 max-w-4xl mx-auto w-full space-y-6">
        {currentCase && currentUC && (
          <>
            {/* Header */}
            <div>
              <p className="text-xs text-slate-400 mb-1"><span className="font-mono">{currentUC.id}</span> · {currentUC.workgroup}</p>
              <h1 className="text-2xl font-bold tracking-tight">{currentUC.title}</h1>
              <div className="flex items-center gap-4 mt-3 text-sm text-slate-600">
                {currentUC.useCaseOwner && <div className="flex items-center gap-2"><OwnerAvatar name={currentUC.useCaseOwner.split(";")[0].trim()} size={28} /><span className="font-medium">{currentUC.useCaseOwner.replace(/;/g, "; ")}</span></div>}
                <StageBadge stage={currentUC.stage} />
              </div>
            </div>

            {/* Starred KPIs */}
            {starredMetrics.length > 0 && (
              <div className="flex gap-4">
                {starredMetrics.map((m) => {
                  const orderedPeriods = sortMetricPeriods(Object.keys(m.periodValues));
                  const rv = getMetricRollupValue(m, orderedPeriods);
                  const sparkVals = orderedPeriods.slice(-6).map((key) => m.periodValues[key]).filter((v) => v != null) as number[];
                  const min = sparkVals.length ? Math.min(...sparkVals) : 0;
                  const max = sparkVals.length ? Math.max(...sparkVals) : 0;
                  const points = sparkVals.map((v, i) => {
                    const x = sparkVals.length === 1 ? 50 : (i / Math.max(sparkVals.length - 1, 1)) * 100;
                    const y = max === min ? 18 : 32 - ((v - min) / (max - min)) * 24;
                    return `${x},${y}`;
                  }).join(" ");
                  return (
                    <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4 min-w-[180px]">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{m.metricName}</p>
                      <p className={`text-2xl font-bold ${m.target != null && rv != null ? (m.direction === "down" ? rv <= m.target : rv >= m.target) ? "text-teal-600" : "text-red-600" : "text-teal-600"}`}>{formatMetricValue(rv, m.unit)}</p>
                      {sparkVals.length > 1 && (
                        <svg viewBox="0 0 100 36" className="w-full h-10 mt-2">
                          <polyline fill="none" stroke="currentColor" strokeWidth="2" className={m.target != null && rv != null ? (m.direction === "down" ? rv <= m.target : rv >= m.target) ? "text-teal-500" : "text-red-500" : "text-teal-500"} points={points} />
                        </svg>
                      )}
                      {m.target !== null && <p className="text-xs text-slate-400 mt-1">target {m.direction === "down" ? "≤" : "≥"} {m.target}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* RAG Health */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-semibold text-slate-700 mb-3">Set RAG health for this review</p>
              <div className="grid grid-cols-3 gap-3">
                {(["green", "orange", "red"] as const).map((c) => (
                  <button key={c} onClick={() => handleSetRag(c)}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      ragStatus === c
                        ? c === "green" ? "border-emerald-500 bg-emerald-50" : c === "orange" ? "border-amber-500 bg-amber-50" : "border-red-500 bg-red-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}>
                    <span className={`font-semibold ${c === "green" ? "text-emerald-700" : c === "orange" ? "text-amber-700" : "text-red-700"}`}>
                      {c === "green" ? "Green" : c === "orange" ? "Amber" : "Red"}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">{c === "green" ? "On track, no action" : c === "orange" ? "Watch closely" : "Intervention needed"}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Process | Metrics | Notes & To-Dos tabs */}
            {/* Custom Metrics (editable in review) */}
            <MetricsTab useCaseId={currentCase.id} metrics={metrics} setMetrics={setMetrics} />

            <PostDeploymentSection
              key={currentCase.id}
              useCaseId={currentCase.id}
              monitoring={monitoring}
              monDesc={monDesc}
              setMonDesc={setMonDesc}
              reviewCycle={normalizeReviewCycle(currentUC.reviewCycle || currentCase.reviewCycle)}
              onReviewCycleChange={(v) => { $updateReviewCycle({ data: { useCaseId: currentCase.id, reviewCycle: v } }).catch(console.error); updateUseCase(currentCase.id, { reviewCycle: v } as any); }}
              monOwner={monOwner}
              setMonOwner={setMonOwner}
              monSaving={monSaving}
              saveMonitoring={saveMonitoring}
              metrics={metrics}
              setMetrics={setMetrics}
              notesContent={
                <div className="space-y-5">
                  {/* Meeting Notes */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Meeting notes</p>
                    <NotesEditor value={meetingNotes} onChange={setMeetingNotes} />
                  </div>
                  {/* Open To-Dos */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Open To-Dos</p>
                    {todos.length > 0 && (
                      <ul className="space-y-2 mb-4">
                        {todos.map((t) => (
                          <li key={t.id} className="flex items-start gap-2 text-sm text-slate-700 group">
                            <button onClick={() => handleToggleTodo(t.id, !t.done)} className="mt-0.5 shrink-0 text-slate-400 hover:text-accent-indigo transition-colors">
                              {t.done ? <CheckSquare className="size-4 text-emerald-600" /> : <Square className="size-4" />}
                            </button>
                            <div className="flex-1">
                              <span className={t.done ? "line-through text-slate-400" : ""}>{t.text}</span>
                              {t.assignee && <span className="text-xs text-slate-400 ml-2">({t.assignee})</span>}
                            </div>
                            <button onClick={() => handleDeleteTodo(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all">
                              <Trash2 className="size-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex gap-2">
                      <Input value={newTodoText} onChange={(e) => setNewTodoText(e.target.value)} placeholder="New to-do…" className="h-8 text-sm flex-1" onKeyDown={(e) => { if (e.key === "Enter") handleAddTodo(); }} />
                      <Input value={newTodoAssignee} onChange={(e) => setNewTodoAssignee(e.target.value)} placeholder="Assignee" className="h-8 text-sm w-32" onKeyDown={(e) => { if (e.key === "Enter") handleAddTodo(); }} />
                      <Button variant="outline" size="sm" className="h-8 px-3 gap-1" onClick={handleAddTodo} disabled={!newTodoText.trim()}><Plus className="size-3" />Add</Button>
                    </div>
                  </div>
                  {/* Files & Links */}
                  {currentUC.links.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Files & Links</p>
                      <div className="space-y-2">
                        {currentUC.links.map((l, i) => {
                          let type: "url" | "file" = "url";
                          let name = l;
                          let href = l;
                          try {
                            const obj = JSON.parse(l);
                            if (obj && obj.type === "file") { type = "file"; name = obj.name; href = obj.data; }
                          } catch {}
                          if (type === "url" && !href.startsWith("http")) href = `https://${href}`;
                          return (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              {type === "file" ? <Paperclip className="size-4 text-slate-400" /> : <Link2 className="size-4 text-slate-400" />}
                              <a href={href} download={type === "file" ? name : undefined} target={type === "url" ? "_blank" : undefined} rel="noreferrer" className="text-accent-indigo hover:underline truncate">{name}</a>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              }
            />
          </>
        )}
      </div>

      {/* Bottom nav */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
        <Button variant="outline" className="gap-1" onClick={goPrev} disabled={currentIdx === 0}>
          <ChevronLeft className="size-4" />Previous
        </Button>
        <Button className="gap-1 bg-teal-700 hover:bg-teal-800 text-white"
          onClick={() => { if (currentIdx === liveCases.length - 1) exit(); else goNext(); }}>
          {currentIdx === liveCases.length - 1 ? "Finish" : "Next"}<ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
