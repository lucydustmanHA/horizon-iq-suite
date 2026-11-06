import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, FileText, Maximize2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import {
  useStrategyUI, useReviewGoals, useReviews, useSaveProgress, useSaveMonthMeta, validateReviewSearch, strategyKeys,
} from "../lib/strategy-hooks";
import {
  goalStatus, offTrackStreak, formatMonthKey, defaultReviewMonth, MONTHS,
  type StrategyGoal, type StrategyReview, type StrategyActivity,
} from "../lib/strategy-types";
import { $saveStrategyReview } from "../lib/strategy.server";
import { StatusPill, PriorityTag, MonthStrip, TrendChart, type MonthMeta } from "../components/strategy/ui";
import { ActivitiesPanel } from "../components/strategy/activities";

export const Route = createFileRoute("/strategy/review/present")({
  validateSearch: validateReviewSearch,
  head: () => ({ meta: [{ title: "Leadership Review — Horizon QX" }] }),
  component: ReviewPresent,
});

/** One slide per department with all of its goals; "More detail" opens a goal panel. */
function ReviewPresent() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const year = useStrategyUI((s) => s.year);
  const month = search.month ?? defaultReviewMonth(year);
  const monthIdx = Number(month.slice(5, 7)) - 1;
  const { goals, data, isLoading } = useReviewGoals(search.dept);
  const { data: reviews = [] } = useReviews(month);
  const saveProgress = useSaveProgress();
  const saveMeta = useSaveMonthMeta();
  const depts = useMemo(() => Array.from(new Set(goals.map((g) => g.department))), [goals]);
  const idx = Math.min(search.i ?? 0, Math.max(depts.length - 1, 0));
  const dept = depts[idx];
  const slideGoals = goals.filter((g) => g.department === dept);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? goals.find((g) => g.id === detailId) ?? null : null;
  useEffect(() => { setDetailId(null); }, [dept]);
  const reviewOf = (id: string) => reviews.find((r) => r.goalId === id);

  const go = (i: number) => navigate({ to: "/strategy/review/present" as any, search: { month, dept: search.dept, i } as any, replace: true });
  const exit = (to = "/strategy/review") => navigate({ to: to as any, search: { month, dept: search.dept } as any });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return; // month comment dialog open
      if (detailId) { if (e.key === "Escape") setDetailId(null); return; }
      if (e.key === "ArrowRight" && idx < depts.length - 1) go(idx + 1);
      if (e.key === "ArrowLeft" && idx > 0) go(idx - 1);
      if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bind each render so handlers see current idx

  if (isLoading) return <div className="fixed inset-0 z-50 bg-slate-50 flex items-center justify-center text-sm text-slate-400">Loading review…</div>;
  if (!dept) return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col items-center justify-center gap-3">
      <p className="text-slate-500">No goals to review for {formatMonthKey(month)}.</p>
      <Button variant="outline" onClick={() => exit()}>Back to Leadership Review</Button>
    </div>
  );

  const progress = ((idx + 1) / depts.length) * 100;
  const onCount = slideGoals.filter((g) => goalStatus(g) === "On track").length;
  const offCount = slideGoals.filter((g) => goalStatus(g) === "Off track").length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col overflow-hidden">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Leadership Review</span>
            <span className="text-[10px] text-slate-500">· {formatMonthKey(month)}{search.dept ? ` · ${search.dept}` : ""}</span>
          </div>
          <p className="text-sm text-slate-700 font-medium">Slide {idx + 1} of {depts.length}<span className="ml-2 text-accent-indigo">· {dept}</span></p>
        </div>
        <div className="flex-1 mx-8"><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-teal-500 transition-all rounded-full" style={{ width: `${progress}%` }} /></div></div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => exit("/strategy/review/report")}><FileText className="size-4" />Report</Button>
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => exit()}><X className="size-4" />Exit</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 max-w-7xl mx-auto w-full space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{dept}</h1>
              <p className="text-sm text-slate-500">{slideGoals.length} goals · {onCount} on track · {offCount} off track · {MONTHS[monthIdx]} actuals</p>
            </div>
            <p className="text-[11px] text-slate-400">Click a month to update it live · ⋯ to comment · More detail for trend, activities &amp; notes</p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {slideGoals.map((g) => (
              <GoalSlideCard key={g.id} goal={g} monthIdx={monthIdx} hasNotes={!!reviewOf(g.id)?.meetingNotes}
                onOpen={() => setDetailId(g.id)} onEdit={(i, v) => saveProgress(g, i, v)} onMeta={(i, m) => saveMeta(g, i, m)} />
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
        <Button variant="outline" className="gap-1" disabled={idx === 0} onClick={() => go(idx - 1)}><ChevronLeft className="size-4" />Previous</Button>
        <p className="text-[11px] text-slate-400 hidden sm:block">Use ← → to move between departments</p>
        {idx < depts.length - 1
          ? <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1" onClick={() => go(idx + 1)}>Next: {depts[idx + 1]}<ChevronRight className="size-4" /></Button>
          : <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1" onClick={() => exit("/strategy/review/report")}><FileText className="size-4" />Finish — view report</Button>}
      </div>

      {detail && (
        <GoalDetail goal={detail} month={month} monthIdx={monthIdx} review={reviewOf(detail.id)} activities={data?.activities ?? []}
          onClose={() => setDetailId(null)} onEdit={(i, v) => saveProgress(detail, i, v)} onMeta={(i, m) => saveMeta(detail, i, m)} />
      )}
    </div>
  );
}

function GoalSlideCard({ goal, monthIdx, hasNotes, onOpen, onEdit, onMeta }: {
  goal: StrategyGoal; monthIdx: number; hasNotes: boolean; onOpen: () => void;
  onEdit: (i: number, v: string) => void; onMeta: (i: number, m: MonthMeta) => void;
}) {
  const status = goalStatus(goal);
  const streak = offTrackStreak(goal);
  const actual = goal.progress[monthIdx] ?? "";
  const comment = goal.monthComments?.[monthIdx] ?? "";
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <PriorityTag name={goal.priority} />
          <h2 className="text-lg font-bold tracking-tight mt-0.5">{goal.objective}</h2>
          {goal.owner && <p className="text-xs text-slate-500">{goal.owner}{goal.secondaryOwner ? `, ${goal.secondaryOwner}` : ""}</p>}
        </div>
        <StatusPill status={status} className="text-xs px-2.5 py-1 shrink-0" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label={`${MONTHS[monthIdx]} actual`} value={actual || "Not reported"} tone={actual ? status === "Off track" ? "text-red-600" : "text-teal-600" : "text-slate-400"} />
        <Stat label="Target" value={goal.targetValue || "—"} sub={goal.direction === "decrease" ? "lower is better" : "higher is better"} />
        <Stat label="Baseline" value={goal.baselineValue || "—"} sub={streak >= 2 ? `Off track ${streak} months running` : undefined} subTone="text-amber-700" />
      </div>
      <MonthStrip goal={goal} size="md" highlightMonth={monthIdx} onEdit={onEdit} onMeta={onMeta} />
      {comment && <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">{MONTHS[monthIdx]} comment:</span> <span className="whitespace-pre-line">{comment}</span></p>}
      <div className="mt-auto flex items-center justify-between">
        <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">{hasNotes && <><StickyNote className="size-3.5" />Meeting notes added</>}</span>
        <Button variant="outline" size="sm" className="gap-1" onClick={onOpen}><Maximize2 className="size-3.5" />More detail</Button>
      </div>
    </div>
  );
}

function GoalDetail({ goal, month, monthIdx, review, activities, onClose, onEdit, onMeta }: {
  goal: StrategyGoal; month: string; monthIdx: number; review?: StrategyReview; activities: StrategyActivity[];
  onClose: () => void; onEdit: (i: number, v: string) => void; onMeta: (i: number, m: MonthMeta) => void;
}) {
  const qc = useQueryClient();
  const saved = review?.meetingNotes ?? "";
  const [notes, setNotes] = useState(saved);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => { setNotes(review?.meetingNotes ?? ""); setSaving("idle"); }, [goal.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    if (notes === saved) return;
    // rag is kept as-is (RAG is no longer shown) so older review rows are not altered
    const next = { goalId: goal.id, reviewMonth: month, rag: review?.rag ?? null, meetingNotes: notes };
    const key = strategyKeys.reviews(month);
    qc.setQueryData<StrategyReview[]>(key, (prev = []) => [...prev.filter((r) => r.goalId !== goal.id), { ...next, updatedBy: null }]);
    setSaving("saving");
    try { await $saveStrategyReview({ data: next }); setSaving("saved"); }
    catch (e) { setSaving("idle"); toast.error("Could not save notes", { description: String((e as Error)?.message ?? e) }); qc.invalidateQueries({ queryKey: key }); }
  };
  const close = async () => { await save(); onClose(); };
  return (
    <div className="absolute inset-0 z-10 flex justify-end bg-slate-900/30" onClick={close}>
      <div className="h-full w-full max-w-4xl bg-slate-50 shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500"><span className="font-semibold text-slate-700">{goal.department}</span><span>·</span><PriorityTag name={goal.priority} /></div>
            <p className="text-lg font-bold tracking-tight truncate">{goal.objective}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-slate-400">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}</span>
            <StatusPill status={goalStatus(goal)} className="text-xs px-2.5 py-1" />
            <Button variant="ghost" size="sm" className="gap-1" onClick={close}><X className="size-4" />Back to slide</Button>
          </div>
        </div>
        <div className="p-6 space-y-5">
          {goal.description && <p className="text-sm text-slate-600">{goal.description}</p>}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-700 mb-2">Monthly actuals</p>
            <MonthStrip goal={goal} size="md" highlightMonth={monthIdx} onEdit={onEdit} onMeta={onMeta} />
            <div className="mt-3"><TrendChart goal={goal} height={200} /></div>
            {goal.monthComments.some((c) => c) && (
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                {goal.monthComments.map((c, i) => c ? <li key={i}><span className="font-semibold text-slate-700">{MONTHS[i]}:</span> <span className="whitespace-pre-line">{c}</span></li> : null)}
              </ul>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-700 mb-2">Meeting notes · {formatMonthKey(month)}</p>
              <Textarea rows={7} value={notes} onChange={(e) => { setNotes(e.target.value); setSaving("idle"); }} onBlur={save}
                placeholder="Discussion, decisions, asks of leadership…" className="text-sm" />
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm space-y-3">
              {goal.monthlyMetric && <div><p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Monthly metric</p><p className="text-slate-700">{goal.monthlyMetric}</p></div>}
              {goal.successCriteria && <div><p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Success criteria</p><p className="text-slate-700">{goal.successCriteria}</p></div>}
              <div><p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Baseline → target</p><p className="text-slate-700">{goal.baselineValue || "—"} → {goal.targetValue || "—"}</p></div>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <p className="text-sm font-semibold text-slate-700 px-4 pt-3 pb-2">Supporting activities</p>
            <ActivitiesPanel goalId={goal.id} activities={activities} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone = "text-slate-900", subTone = "text-slate-400" }: { label: string; value: string; sub?: string; tone?: string; subTone?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 truncate ${tone}`}>{value}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${subTone}`}>{sub}</p>}
    </div>
  );
}
