import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Download, Trash2, MessageSquare } from "lucide-react";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { $loadLiveCases, $updateReviewCycle, $getReviewSessions, $deleteReviewSession } from "../lib/live.server";
import { usePortfolio } from "../lib/store";
import { $updateUseCase, $getTodos } from "../lib/use-cases.server";
import type { LiveCaseSummary } from "../lib/live-mock-data";
import { OwnerAvatar } from "../components/badges";
import { REVIEW_CYCLE_OPTIONS, formatReviewKey, getCurrentReviewKey, inferReviewCycleFromKey, normalizeReviewCycle, isReviewDueForCurrentPeriod } from "../lib/live-review-utils";

export const Route = createFileRoute("/live/")({
  component: LiveDashboard,
});


function LiveDashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<LiveCaseSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [dialogCycle, setDialogCycle] = useState<string>("Monthly");
  const [sessions, setSessions] = useState<{ reviewKey: string; cycle: string; completedAt: string; caseCount: number }[]>([]);
  const [cycleFilter, setCycleFilter] = useState<string>("All");
  const reviewableCycleOptions = REVIEW_CYCLE_OPTIONS.filter((opt) => opt !== "One-and-Done");

  useEffect(() => {
    $getReviewSessions().then(setSessions).catch(console.error);
  }, []);

  useEffect(() => {
    setLoaded(false);
    const fetchWithRetry = (attempt = 0) => {
      $loadLiveCases({ data: {} })
        .then((loadedCases) => { setCases(loadedCases); setLoaded(true); })
        .catch((err) => {
          console.error(`[Live] load attempt ${attempt + 1} failed:`, err);
          if (attempt < 2) setTimeout(() => fetchWithRetry(attempt + 1), 1500);
          else setLoaded(true);
        });
    };
    fetchWithRetry();
  }, []);

  const reviewableCases = useMemo(
    () => cases.filter((c) => normalizeReviewCycle(c.reviewCycle) !== "One-and-Done"),
    [cases],
  );
  const filteredReviewable = useMemo(
    () => cycleFilter === "All" ? reviewableCases : reviewableCases.filter((c) => normalizeReviewCycle(c.reviewCycle) === cycleFilter),
    [reviewableCases, cycleFilter],
  );
  const oneAndDoneCases = useMemo(
    () => cases.filter((c) => normalizeReviewCycle(c.reviewCycle) === "One-and-Done"),
    [cases],
  );

  // Suggested / overdue reviews: group reviewable cases by cycle that are past due
  const suggestedReviews = useMemo(() => {
    const cycleBuckets: Record<string, { cycle: string; count: number; reviewKey: string }> = {};
    for (const c of reviewableCases) {
      const norm = normalizeReviewCycle(c.reviewCycle);
      if (norm === "Ad Hoc Review" || norm === "One-and-Done") continue;
      if (!isReviewDueForCurrentPeriod(norm, c.latestReviewKey)) continue;
      if (!cycleBuckets[norm]) cycleBuckets[norm] = { cycle: norm, count: 0, reviewKey: getCurrentReviewKey(norm) };
      cycleBuckets[norm].count += 1;
    }
    return Object.values(cycleBuckets).sort((a, b) => {
      const order = ["Weekly", "Monthly", "Quarterly", "Bi-Annual", "Annual"];
      return order.indexOf(a.cycle) - order.indexOf(b.cycle);
    });
  }, [reviewableCases]);

  const grouped = useMemo(() => {
    const green = filteredReviewable.filter((c) => c.ragStatus === "green");
    const orange = filteredReviewable.filter((c) => c.ragStatus === "orange");
    const red = filteredReviewable.filter((c) => c.ragStatus === "red");
    const unset = filteredReviewable.filter((c) => !c.ragStatus || !["green", "orange", "red"].includes(c.ragStatus));
    return { green, orange, red, unset };
  }, [filteredReviewable]);

  const totalLive = cases.length;
  const openTodos = cases.reduce((sum, c) => sum + c.openTodos, 0);

  const handleUpdateCase = (id: string, patch: Partial<LiveCaseSummary>) => {
    setCases((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const handleSetCycle = async (useCase: LiveCaseSummary, cycle: string) => {
    setCases((prev) => prev.map((item) => item.id === useCase.id ? { ...item, reviewCycle: cycle } : item));
    try {
      await $updateReviewCycle({ data: { useCaseId: useCase.id, reviewCycle: cycle } });
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteSession = async (reviewKey: string) => {
    if (!confirm("Delete this review session? This cannot be undone.")) return;
    setSessions((prev) => prev.filter((s) => s.reviewKey !== reviewKey));
    await $deleteReviewSession({ data: { reviewKey } });
  };

  const handleStartReview = () => {
    navigate({ to: "/live/review", search: { cycle: dialogCycle, reviewKey: getCurrentReviewKey(dialogCycle) } });
    setReviewDialogOpen(false);
  };

return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live & Delivering</h1>
          <p className="text-sm text-slate-500 mt-2 max-w-3xl">Live use cases grouped by RAG health. Start a formal review to walk through use cases by review cycle.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Select value={cycleFilter} onValueChange={setCycleFilter}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="Filter by cycle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All cycles</SelectItem>
              {REVIEW_CYCLE_OPTIONS.filter(o => o !== "One-and-Done").map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="bg-teal-700 hover:bg-teal-800 text-white" onClick={() => setReviewDialogOpen(true)}>
            Start Review
          </Button>
        </div>
      </div>

      {/* Reviews Due */}
      {suggestedReviews.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl px-5 py-4 space-y-2">
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Reviews Due</p>
          <div className="flex flex-wrap gap-2">
            {suggestedReviews.map((s) => (
              <button
                key={s.cycle}
                onClick={() => navigate({ to: "/live/review", search: { cycle: s.cycle, reviewKey: s.reviewKey } })}
                className="flex items-center gap-2 border border-amber-300 bg-white rounded-lg px-3 py-2 hover:border-amber-400 hover:bg-amber-50 transition-colors text-left"
              >
                <span className="size-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
                <span className="text-xs font-medium text-slate-700">{s.cycle}</span>
                <span className="text-[10px] text-amber-600 font-semibold">{s.count} case{s.count !== 1 ? "s" : ""} due</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400">Use cases that haven't been reviewed within their assigned cycle period. Click to start.</p>
        </div>
      )}

      {/* Past Reviews */}
      {sessions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 space-y-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Past Reviews</p>
          <div className="flex flex-wrap gap-2">
            {sessions.map((s) => (
              <div key={s.reviewKey} className="group flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-teal-300 transition-colors">
                <button onClick={() => navigate({ to: "/live/report", search: { cycle: s.cycle, reviewKey: s.reviewKey } })} className="text-left">
                  <span className="text-xs font-medium text-slate-700">{formatReviewKey(s.reviewKey)}</span>
                  <span className="text-[10px] text-slate-400 ml-2">{s.cycle}</span>
                  <span className="text-[10px] text-slate-400 ml-2">{new Date(s.completedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}</span>
                  <span className="text-[10px] text-slate-300 ml-1">· {s.caseCount} cases</span>
                </button>
                <button onClick={() => handleDeleteSession(s.reviewKey)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all" title="Delete review">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard label="TOTAL LIVE" value={String(totalLive)} sub="use cases currently in production" />
        <MetricCard label="GREEN / AMBER / RED" value={`${grouped.green.length} / ${grouped.orange.length} / ${grouped.red.length}`} sub="current RAG breakdown" />
        <MetricCard label="OPEN TO-DOS" value={String(openTodos)} sub="across the live portfolio" highlight={openTodos > 0} />
      </div>

      {/* Start Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Start a Formal Review</DialogTitle></DialogHeader>
          <div className="py-4">
            <label className="text-xs font-medium text-slate-500 mb-2 block">Select review cycle</label>
            <Select value={dialogCycle} onValueChange={setDialogCycle}>
              <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {reviewableCycleOptions.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400 mt-2">This will pull in all use cases assigned to the selected review cycle.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button className="bg-teal-700 hover:bg-teal-800 text-white" onClick={handleStartReview}>Start</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!loaded && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <svg className="animate-spin size-8 text-accent-indigo" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-slate-400 text-sm">Loading deployed use cases…</p>
        </div>
      )}

      {loaded && cases.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <p className="text-slate-500 font-medium">No deployed use cases yet</p>
          <p className="text-slate-400 text-sm mt-1">Move a use case to the “Live” stage to see it here</p>
        </div>
      )}

      {grouped.green.length > 0 && <RagSection color="green" label="Green" desc="On track" count={grouped.green.length} hoursSaved={grouped.green.reduce((sum, item) => sum + item.hoursSaved, 0)} cases={grouped.green} onSetCycle={handleSetCycle} onUpdateCase={handleUpdateCase} />}
      {grouped.orange.length > 0 && <RagSection color="orange" label="Amber" desc="Actively monitoring" count={grouped.orange.length} hoursSaved={grouped.orange.reduce((sum, item) => sum + item.hoursSaved, 0)} cases={grouped.orange} onSetCycle={handleSetCycle} onUpdateCase={handleUpdateCase} />}
      {grouped.red.length > 0 && <RagSection color="red" label="Red" desc="Intervention needed" count={grouped.red.length} hoursSaved={grouped.red.reduce((sum, item) => sum + item.hoursSaved, 0)} cases={grouped.red} onSetCycle={handleSetCycle} onUpdateCase={handleUpdateCase} />}
      {grouped.unset.length > 0 && <RagSection color="gray" label="Not reviewed" count={grouped.unset.length} hoursSaved={grouped.unset.reduce((sum, item) => sum + item.hoursSaved, 0)} cases={grouped.unset} onSetCycle={handleSetCycle} onUpdateCase={handleUpdateCase} />}
      {oneAndDoneCases.length > 0 && <RagSection color="gray" label="One-and-Done" desc="Live but no tracking necessary" count={oneAndDoneCases.length} hoursSaved={oneAndDoneCases.reduce((sum, item) => sum + item.hoursSaved, 0)} cases={oneAndDoneCases} onSetCycle={handleSetCycle} onUpdateCase={handleUpdateCase} />}
    </div>
  );
}

function MetricCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? "text-amber-600" : "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function MiniDonut({ value, meetsTarget }: { value: number; meetsTarget: boolean }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div className="relative size-12 shrink-0">
      <svg viewBox="0 0 40 40" className="size-12 -rotate-90">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-100" />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={meetsTarget ? "text-teal-500" : "text-red-500"}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-600">{clamped}%</div>
    </div>
  );
}

function RagSection({ color, label, desc, count, hoursSaved, cases, onSetCycle, onUpdateCase }: { color: string; label: string; desc?: string; count: number; hoursSaved: number; cases: LiveCaseSummary[]; onSetCycle?: (useCase: LiveCaseSummary, cycle: string) => void; onUpdateCase?: (id: string, patch: Partial<LiveCaseSummary>) => void }) {
  const styles: Record<string, { bg: string; text: string; dot: string }> = {
    green:  { bg: "bg-emerald-50 border-l-4 border-l-emerald-500", text: "text-emerald-700", dot: "bg-emerald-500" },
    orange: { bg: "bg-amber-50 border-l-4 border-l-amber-500",     text: "text-amber-700",   dot: "bg-amber-500" },
    red:    { bg: "bg-red-50 border-l-4 border-l-red-500",         text: "text-red-700",     dot: "bg-red-500" },
    gray:   { bg: "bg-slate-50 border-l-4 border-l-slate-400",     text: "text-slate-600",   dot: "bg-slate-400" },
  };
  const s = styles[color] || styles.gray;

  return (
    <div className="space-y-3">
      <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${s.bg}`}>
        <div className="flex items-center gap-2">
          <span className={`size-2.5 rounded-full ${s.dot}`} />
          <span className={`font-semibold ${s.text}`}>{label}</span>
          <span className="text-slate-500 font-medium ml-1">({count})</span>
          {desc && <span className="text-xs text-slate-400 font-normal ml-1">{desc}</span>}
        </div>
        {hoursSaved > 0 && <span className="text-sm text-slate-500">{hoursSaved.toLocaleString()} hrs saved</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cases.map((c) => <LiveCaseCard key={c.id} case_={c} onSetCycle={onSetCycle} onUpdateCase={onUpdateCase} />)}
      </div>
    </div>
  );
}

function TodoHoverPopup({ useCaseId, openTodos }: { useCaseId: string; openTodos: number }) {
  const [hovered, setHovered] = useState(false);
  const [todos, setTodos] = useState<Array<{ id: string; text: string; done: boolean }> | null>(null);
  const [loading, setLoading] = useState(false);

  const handleMouseEnter = () => {
    setHovered(true);
    if (!todos && !loading) {
      setLoading(true);
      $getTodos({ data: { useCaseId } })
        .then((items) => setTodos(items.filter((t: any) => !t.done)))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  };

  return (
    <div className="relative" onMouseEnter={handleMouseEnter} onMouseLeave={() => setHovered(false)}>
      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded cursor-default">
        {openTodos} to-do{openTodos > 1 ? "s" : ""}
      </span>
      {hovered && (
        <div className="absolute bottom-full left-0 mb-1.5 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Open To-Dos</p>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-2 text-[10px] text-slate-400 italic">Loading…</p>
            ) : todos && todos.length > 0 ? (
              <div className="py-1">
                {todos.map((t) => (
                  <div key={t.id} className="px-3 py-1.5 flex items-start gap-1.5">
                    <span className="size-1.5 rounded-full bg-amber-400 mt-1 shrink-0" />
                    <span className="text-[10px] text-slate-700 leading-snug">{t.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-[10px] text-slate-400 italic">No open to-dos</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LiveCaseCard({ case_: c, onSetCycle, onUpdateCase }: { case_: LiveCaseSummary; onSetCycle?: (useCase: LiveCaseSummary, cycle: string) => void; onUpdateCase?: (id: string, patch: Partial<LiveCaseSummary>) => void }) {
  const updateUseCase = usePortfolio((s) => s.updateUseCase);
  const [localApproach, setLocalApproach] = useState(() =>
    c.proactivePct !== null && c.proactivePct > 0 ? "proactive" : c.proactivePct !== null && c.proactivePct === 0 ? "reactive" : "unset"
  );
  const approachVal = localApproach;
  const handleApproachChange = async (v: string) => {
    setLocalApproach(v);
    const dbPatch = v === "proactive"
      ? { proactivePct: 100, reactivePct: 0 }
      : v === "reactive" ? { proactivePct: 0, reactivePct: 100 } : null;
    if (!dbPatch) return;
    onUpdateCase?.(c.id, { proactivePct: dbPatch.proactivePct });
    updateUseCase(c.id, dbPatch);
    try { await $updateUseCase({ data: { id: c.id, ...dbPatch } }); } catch (e) { console.error(e); }
  };

  const ragAccent = c.ragStatus === "green" ? "#10b981" : c.ragStatus === "orange" ? "#f59e0b" : c.ragStatus === "red" ? "#ef4444" : "#e2e8f0";

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all h-full overflow-hidden">
      <div className="h-1 w-full" style={{ backgroundColor: ragAccent }} />

      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-[10px] text-slate-400 font-mono">{c.id}</span>
          <div className="flex items-center gap-2">
            <Select value={normalizeReviewCycle(c.reviewCycle)} onValueChange={(v) => onSetCycle?.(c, v)}>
              <SelectTrigger className="h-5 text-[10px] font-semibold uppercase border-0 bg-slate-100 text-slate-600 rounded-full px-2 py-0 gap-0.5 w-auto shadow-none focus:ring-0" onClick={(e) => e.preventDefault()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVIEW_CYCLE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={approachVal} onValueChange={handleApproachChange}>
              <SelectTrigger className={`h-5 text-[10px] font-semibold uppercase border rounded-full px-2 py-0 gap-0.5 w-auto shadow-none focus:ring-0 ${approachVal === "proactive" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : approachVal === "reactive" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-red-50 text-red-500 border-red-200 animate-pulse"}`} onClick={(e) => e.preventDefault()}>
                <SelectValue>{approachVal === "unset" ? "Set approach" : approachVal === "proactive" ? "Proactive" : "Reactive"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="proactive">Proactive</SelectItem>
                <SelectItem value="reactive">Reactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Link to="/live/$id" params={{ id: c.id }} className="font-semibold text-slate-900 text-sm leading-tight mb-2 hover:text-accent-indigo transition-colors">{c.title}</Link>
        {c.owner && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
            <OwnerAvatar name={c.owner.split(";")[0].trim()} size={18} />
            <span className="truncate">{c.owner.replace(/;/g, "; ")}</span>
          </div>
        )}

        {c.starredMetrics.length > 0 && (
          <div className="space-y-2.5 mb-3">
            {c.starredMetrics.slice(0, 3).map((m) => {
              const vals = Object.values(m.periodValues);
              const rollupVal = vals.length > 0
                ? m.rollup === "latest" ? vals[vals.length - 1]
                : m.rollup === "sum" ? vals.reduce((a, b) => a + b, 0)
                : vals.reduce((a, b) => a + b, 0) / vals.length
                : null;
              const meetsTarget = m.target == null || rollupVal === null ? true
                : m.direction === "down" ? rollupVal <= m.target : rollupVal >= m.target;
              const pct = m.target && rollupVal !== null
                ? Math.min(100, Math.round((m.direction === "down" ? (m.target / Math.max(rollupVal, 0.01)) : (rollupVal / m.target)) * 100))
                : null;
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 mb-0.5">
                      <span className="text-[10px] text-slate-500 font-medium uppercase truncate">{m.metricName}</span>
                      <span className={`text-xs font-bold tabular-nums shrink-0 ${rollupVal === null ? "text-slate-300" : meetsTarget ? "text-teal-600" : "text-red-500"}`}>
                        {rollupVal !== null ? `${rollupVal % 1 === 0 ? rollupVal : rollupVal.toFixed(1)}${m.unit === "%" ? "%" : ""}` : "—"}
                        {m.target != null && rollupVal !== null && <span className="text-slate-300 font-normal"> / {m.target}{m.unit === "%" ? "%" : ""}</span>}
                      </span>
                    </div>
                    {m.target != null && <p className="text-[10px] text-slate-400">Target {m.direction === "down" ? "≤" : "≥"} {m.target}{m.unit === "%" ? "%" : ""}</p>}
                  </div>
                  {pct !== null && <MiniDonut value={pct} meetsTarget={meetsTarget} />}
                </div>
              );
            })}
          </div>
        )}

        {c.hoursSaved > 0 && (
          <div className="inline-flex items-center gap-1 bg-slate-50 rounded-md px-2 py-1 mb-2 w-fit">
            <span className="text-[10px] text-slate-500 font-medium">{c.hoursSaved.toLocaleString()} hrs saved</span>
          </div>
        )}

        {c.statusUpdate && (
          <div className="flex items-start gap-1.5 bg-slate-50 rounded-md px-2.5 py-2 mb-2">
            <MessageSquare className="size-3 text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">{c.statusUpdate}</p>
              {c.statusUpdateDate && <p className="text-[10px] text-slate-400 mt-0.5">{new Date(c.statusUpdateDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>}
            </div>
          </div>
        )}

        <div className="flex-1" />

        <div className="pt-3 mt-3 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between gap-2">
            {c.openTodos > 0
              ? <TodoHoverPopup useCaseId={c.id} openTodos={c.openTodos} />
              : <span className="text-[10px] text-slate-300">No to-dos</span>
            }
            {c.latestReviewKey && <span className="text-[10px] text-slate-400">{formatReviewKey(c.latestReviewKey)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
