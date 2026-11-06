import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { useStrategyUI, useStrategyYearData, useRefreshStrategy, useSaveProgress, useSaveGoalField, useSaveMonthMeta } from "../lib/strategy-hooks";
import { goalStatus, offTrackStreak, latestReported, canOverrideMonths, MONTHS, type StrategyGoal } from "../lib/strategy-types";
import { $deleteGoal } from "../lib/strategy.server";
import { Card, GoalDialog, StatusPill, PriorityTag, MonthStrip, TrendChart, LoadError, EmptyState } from "../components/strategy/ui";
import { ActivitiesPanel } from "../components/strategy/activities";

export const Route = createFileRoute("/strategy/goals/$id")({
  head: () => ({ meta: [{ title: "Goal — Strategy — Horizon QX" }] }),
  component: GoalPage,
});

function GoalPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const year = useStrategyUI((s) => s.year);
  const setYear = useStrategyUI((s) => s.setYear);
  // Goal ids encode the year (e.g. INF26-SAF); fall back to the selected year.
  const m = /^[A-Z]+(\d{2})-/.exec(id);
  const idYear = m ? 2000 + Number(m[1]) : year;
  const { data, isLoading, error } = useStrategyYearData(idYear);
  const refresh = useRefreshStrategy();
  const saveProgress = useSaveProgress();
  const saveField = useSaveGoalField();
  const saveMeta = useSaveMonthMeta();
  const [editOpen, setEditOpen] = useState(false);

  const goal = data?.goals.find((g) => g.id === id) ?? null;
  useEffect(() => { if (goal && goal.year !== year) setYear(goal.year); }, [goal?.year]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="p-8"><LoadError error={error} /></div>;
  if (isLoading) return <div className="p-8 text-sm text-slate-400">Loading goal…</div>;
  if (!goal) return (
    <div className="p-8"><Card><EmptyState title="Goal not found" body="It may have been deleted or belongs to another plan year."
      action={<Button variant="outline" onClick={() => navigate({ to: "/strategy" as any })}>Back to dashboard</Button>} /></Card></div>
  );

  const status = goalStatus(goal);
  const streak = offTrackStreak(goal);
  const last = latestReported(goal);
  const del = async () => {
    if (!confirm(`Delete "${goal.objective}"? Monthly actuals, activities and review notes for this goal are deleted too.`)) return;
    try { await $deleteGoal({ data: { id: goal.id } }); await refresh(); toast.success("Goal deleted"); navigate({ to: `/strategy/departments/${encodeURIComponent(goal.department)}` as any }); }
    catch (e) { toast.error("Could not delete goal", { description: String((e as Error)?.message ?? e) }); }
  };

  return (
    <div className="p-8 space-y-5">
      <div>
        <Link to={`/strategy/departments/${encodeURIComponent(goal.department)}` as any} className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
          <ChevronLeft className="size-4" />{goal.department}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <PriorityTag name={goal.priority} /><span>·</span><span>FY{goal.year}</span><span>·</span><span className="font-mono">{goal.id}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-1">{goal.objective}</h1>
            {goal.description && <p className="text-sm text-slate-600 mt-1 max-w-3xl">{goal.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusPill status={status} className="text-xs px-2.5 py-1" />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}><Pencil className="size-3.5" />Edit</Button>
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-status-danger" onClick={del} aria-label="Delete goal"><Trash2 className="size-4" /></Button>
          </div>
        </div>
        {streak >= 2 && <p className="mt-2 inline-flex text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">Off track for {streak} consecutive months</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card title="Monthly actuals" actions={<span className="text-[11px] text-slate-400">Click a month to enter or edit · ⋯ to comment{canOverrideMonths(goal.year) ? " or set red/green" : ""}</span>}>
            <MonthStrip goal={goal} size="md" highlightMonth={last?.month} onEdit={(i, v) => saveProgress(goal, i, v)} onMeta={(i, meta) => saveMeta(goal, i, meta)} />
            {goal.monthComments.some((c) => c) && (
              <ul className="mt-3 space-y-1 text-xs text-slate-600">
                {goal.monthComments.map((c, i) => c ? <li key={i}><span className="font-semibold text-slate-700">{MONTHS[i]}:</span> <span className="whitespace-pre-line">{c}</span></li> : null)}
              </ul>
            )}
            <div className="mt-4"><TrendChart goal={goal} height={170} /></div>
          </Card>
          <Card title="Supporting activities" bodyClassName="">
            <ActivitiesPanel goalId={goal.id} activities={data?.activities ?? []} />
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Details">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Detail label="Owner" value={goal.owner} />
              <Detail label="Secondary owner" value={goal.secondaryOwner} />
              <Detail label="Baseline" value={goal.baselineValue} />
              <Detail label="Target" value={goal.targetValue} strong />
              <Detail label="Latest" value={last ? `${last.value} (${MONTHS[last.month]})` : ""} />
              <Detail label="Good when" value={goal.direction === "decrease" ? "At or below target" : "At or above target"} />
              <Detail label="Monthly metric" value={goal.monthlyMetric} wide />
              <Detail label="Success criteria" value={goal.successCriteria} wide />
              {goal.statusOverride && <Detail label="Status" value={`${goal.statusOverride} (set manually)`} wide />}
            </dl>
          </Card>
          <NotesCard goal={goal} onSave={(notes) => saveField(goal, { notes })} />
        </div>
      </div>
      <GoalDialog open={editOpen} onClose={() => setEditOpen(false)} goal={goal} />
    </div>
  );
}

function Detail({ label, value, strong, wide }: { label: string; value: string; strong?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</dt>
      <dd className={`mt-0.5 ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>{value || "—"}</dd>
    </div>
  );
}

function NotesCard({ goal, onSave }: { goal: StrategyGoal; onSave: (notes: string) => Promise<void> }) {
  const [draft, setDraft] = useState(goal.notes);
  const [saved, setSaved] = useState(true);
  useEffect(() => { setDraft(goal.notes); setSaved(true); }, [goal.id, goal.notes]);
  return (
    <Card title="Notes" actions={<span className="text-[11px] text-slate-400">{saved ? "Saved" : "Unsaved — click away to save"}</span>}>
      <Textarea rows={6} value={draft} placeholder="Context, risks, decisions…"
        onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
        onBlur={async () => { if (draft !== goal.notes) { await onSave(draft); } setSaved(true); }} className="text-sm" />
    </Card>
  );
}
