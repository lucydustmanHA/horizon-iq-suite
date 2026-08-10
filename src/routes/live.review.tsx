import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Star, Save, Plus, Trash2, Link2, Paperclip } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { OwnerAvatar, StageBadge } from "../components/badges";
import { usePortfolio } from "../lib/store";
import type { LiveMetric, LiveMonitoring, LiveReview } from "../lib/live-mock-data";
import { RAG_OPTIONS, METRIC_UNITS, ROLLUP_OPTIONS } from "../lib/live-mock-data";
import { $getMonitoring, $getMetrics, $getReview, $upsertReview, $loadLiveCases } from "../lib/live.server";
import { $getTodos, $addTodo } from "../lib/use-cases.server";
import { NotesEditor } from "../components/notes-editor";
import type { LiveCaseSummary } from "../lib/live-mock-data";

export const Route = createFileRoute("/live/review")({
  component: ReviewCarousel,
  validateSearch: (search: Record<string, unknown>) => ({
    month: (search.month as string) || getCurrentMonth(),
  }),
});

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}



function ReviewCarousel() {
  const navigate = useNavigate();
  const { month } = Route.useSearch();
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
    $loadLiveCases({ data: { reviewMonth: month } })
      .then((c) => { setLiveCases(c.filter((x) => !x.nonApplicable)); setLoaded(true); })
      .catch((err) => { console.error(err); setLoaded(true); });
  }, [month]);

  const currentCase = liveCases[currentIdx];
  const currentUC = currentCase ? allUseCases.find((u) => u.id === currentCase.id) : null;

  useEffect(() => {
    if (!currentCase) return;
    const ucId = currentCase.id;
    Promise.all([
      $getMonitoring({ data: { useCaseId: ucId } }),
      $getMetrics({ data: { useCaseId: ucId } }),
      $getReview({ data: { useCaseId: ucId, reviewMonth: month } }),
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
  }, [currentCase?.id, month]);

  const saveReviewData = async () => {
    if (!currentCase) return;
    setSavingReview(true);
    await $upsertReview({ data: { useCaseId: currentCase.id, reviewMonth: month, ragStatus, meetingNotes, comment } });
    setSavingReview(false);
  };

  const handleAddTodo = async () => {
    if (!currentCase || !newTodoText.trim()) return;
    await $addTodo({ data: { useCaseId: currentCase.id, text: newTodoText.trim(), assignee: newTodoAssignee.trim() } });
    const refreshed = await $getTodos({ data: { useCaseId: currentCase.id } });
    setTodos(refreshed);
    setNewTodoText("");
    setNewTodoAssignee("");
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
  const allPeriods = Array.from(new Set(metrics.flatMap((m) => Object.keys(m.periodValues)))).sort();

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Monthly Review</p>
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
                {currentUC.useCaseOwner && <div className="flex items-center gap-2"><OwnerAvatar name={currentUC.useCaseOwner} size={28} /><span className="font-medium">{currentUC.useCaseOwner}</span></div>}
                <StageBadge stage={currentUC.stage} />
              </div>
            </div>

            {/* Starred KPIs */}
            {starredMetrics.length > 0 && (
              <div className="flex gap-4">
                {starredMetrics.map((m) => {
                  const vals = Object.values(m.periodValues);
                  const rv = vals.length > 0 ? (m.rollup === "avg" ? vals.reduce((a, b) => a + b, 0) / vals.length : m.rollup === "latest" ? vals[vals.length - 1] : vals.reduce((a, b) => a + b, 0)) : null;
                  return (
                    <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4 min-w-[140px]">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{m.metricName}</p>
                      <p className="text-2xl font-bold text-teal-600">{rv !== null ? `${rv.toFixed(1)}${m.unit === "%" ? "%" : ""}` : "—"}</p>
                      {m.target !== null && <p className="text-xs text-slate-400 mt-1">target ${m.direction === "down" ? "≤" : "≥"} ${m.target}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Process (monitoring) */}
            {monitoring?.description && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Monitoring Process</p>
                <div className="text-sm text-slate-700 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5" dangerouslySetInnerHTML={{ __html: monitoring.description }} />
                <p className="text-xs text-slate-400 mt-3">Cadence: {monitoring.cadence} · Owner: {monitoring.monitoringOwner}</p>
              </div>
            )}

            {/* Metrics table (read-only in review) */}
            {metrics.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 pt-3 pb-1">Tracked Metrics</p>
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Metric</th>
                      {allPeriods.slice(-6).map((p) => <th key={p} className="px-2 py-2 text-center text-xs font-semibold text-slate-500 uppercase">{p}</th>)}
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Roll-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map((m) => {
                      const vals = Object.values(m.periodValues);
                      const rv = vals.length > 0 ? (m.rollup === "avg" ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : m.rollup === "latest" ? String(vals[vals.length - 1]) : String(vals.reduce((a, b) => a + b, 0))) : "—";
                      return (
                        <tr key={m.id} className="border-b border-slate-100">
                          <td className="px-4 py-2 font-medium">{m.starred && <Star className="size-3 inline text-amber-500 fill-amber-500 mr-1" />}{m.metricName}</td>
                          {allPeriods.slice(-6).map((p) => <td key={p} className="px-2 py-2 text-center">{m.periodValues[p] ?? ""}</td>)}
                          <td className="px-3 py-2 text-right font-bold">{rv}{m.unit === "%" ? "%" : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Files & Links (read-only) */}
            {currentUC.links.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Files & Links</p>
                <div className="space-y-2">
                  {currentUC.links.map((l, i) => {
                    let name = l; let href = l;
                    try { const obj = JSON.parse(l); if (obj.type === "file") { name = obj.name; href = obj.data; } } catch {}
                    if (!href.startsWith("http") && !href.startsWith("data:")) href = `https://${href}`;
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {l.includes('"type":"file"') ? <Paperclip className="size-4 text-slate-400" /> : <Link2 className="size-4 text-slate-400" />}
                        <a href={href} target="_blank" rel="noreferrer" className="text-accent-indigo hover:underline truncate">{name}</a>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* RAG Health */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-semibold text-slate-700 mb-3">Set RAG health for this month</p>
              <div className="grid grid-cols-3 gap-3">
                {(["green", "orange", "red"] as const).map((c) => (
                  <button key={c} onClick={() => setRagStatus(c)}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      ragStatus === c
                        ? c === "green" ? "border-emerald-500 bg-emerald-50" : c === "orange" ? "border-amber-500 bg-amber-50" : "border-red-500 bg-red-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}>
                    <span className={`font-semibold ${c === "green" ? "text-emerald-700" : c === "orange" ? "text-amber-700" : "text-red-700"}`}>
                      {c === "green" ? "Green" : c === "orange" ? "Orange" : "Red"}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">{c === "green" ? "On track, no action" : c === "orange" ? "Watch closely" : "Intervention needed"}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Meeting Notes */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <p className="text-sm font-semibold text-slate-700 mb-3">Meeting notes</p>
              <NotesEditor value={meetingNotes} onChange={setMeetingNotes} />
            </div>

            {/* Open To-Dos */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Open To-Dos</p>
              {todos.filter((t) => !t.done).length > 0 && (
                <ul className="space-y-2 mb-4">
                  {todos.filter((t) => !t.done).map((t) => (
                    <li key={t.id} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="size-4 mt-0.5 rounded border border-slate-300 shrink-0" />
                      <div className="flex-1">
                        <span>{t.text}</span>
                        {t.assignee && <span className="text-xs text-slate-400 ml-2">({t.assignee})</span>}
                      </div>
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

            {/* Quick comment */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Health note (shows on card)</p>
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Brief note visible on the dashboard card…" className="h-9 text-sm" />
            </div>
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
