import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Target, AlertTriangle, Presentation, Rocket, ListChecks } from "lucide-react";
import { Button } from "../components/ui/button";
import { useStrategyUI, useStrategyYearData, useStrategyOptions } from "../lib/strategy-hooks";
import {
  goalStatus, latestReported, offTrackStreak, goalMatches, priorityColor, sortPriorities, STATUS_STYLES, MONTHS, fmtDate,
  type GoalStatus, type StrategyGoal,
} from "../lib/strategy-types";
import { PageHeader, KpiTile, Card, EmptyState, GoalDialog, LoadError } from "../components/strategy/ui";

export const Route = createFileRoute("/strategy/")({
  head: () => ({ meta: [{ title: "Strategy — Horizon QX" }] }),
  component: StrategyDashboard,
});

type Filter = "all" | GoalStatus | "attention";

function StrategyDashboard() {
  const navigate = useNavigate();
  const { year, search } = useStrategyUI();
  const { data, isLoading, error } = useStrategyYearData();
  const { departments, priorities } = useStrategyOptions();
  const [filter, setFilter] = useState<Filter>("all");
  const [newGoal, setNewGoal] = useState<null | Partial<StrategyGoal>>(null);

  const goals = useMemo(() => (data?.goals ?? []).filter((g) => goalMatches(search, g)), [data, search]);
  const stats = useMemo(() => {
    const by = (s: GoalStatus) => goals.filter((g) => goalStatus(g) === s).length;
    return {
      total: goals.length, on: by("On track"), off: by("Off track"), done: by("Complete"),
      attention: goals.filter((g) => offTrackStreak(g) >= 2),
    };
  }, [goals]);

  const visible = (g: StrategyGoal) =>
    filter === "all" ? true : filter === "attention" ? offTrackStreak(g) >= 2 : goalStatus(g) === filter;

  // Rows: configured departments plus any department that only exists on goals.
  const deptRows = useMemo(() => Array.from(new Set([...departments, ...goals.map((g) => g.department)])).filter(Boolean), [departments, goals]);
  const prioCols = useMemo(() => sortPriorities(Array.from(new Set([...priorities, ...goals.map((g) => g.priority)])).filter(Boolean), priorities), [priorities, goals]);

  const initiatives = data?.initiatives ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data?.activities ?? []).filter((a) => a.status !== "Done" && a.dueDate && a.dueDate >= today).slice(0, 5);
  const goalById = new Map((data?.goals ?? []).map((g) => [g.id, g]));

  if (error) return <div className="p-8"><LoadError error={error} /></div>;

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Strategy Dashboard"
        subtitle={`FY${year} · ${stats.total} goal${stats.total === 1 ? "" : "s"} across ${new Set(goals.map((g) => g.department)).size} departments`}
        actions={stats.total > 0 && (
          <Button variant="outline" className="gap-1.5" onClick={() => navigate({ to: "/strategy/review" as any })}>
            <Presentation className="size-4" />Leadership review
          </Button>
        )}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Goals" value={isLoading ? "…" : stats.total} sub={stats.done ? `${stats.done} complete` : "This plan year"} active={filter === "all"} onClick={() => setFilter("all")} />
        <KpiTile label="On track" value={stats.on} accent="border-l-4 border-l-emerald-400" active={filter === "On track"} onClick={() => setFilter(filter === "On track" ? "all" : "On track")} />
        <KpiTile label="Off track" value={stats.off} accent="border-l-4 border-l-red-400" active={filter === "Off track"} onClick={() => setFilter(filter === "Off track" ? "all" : "Off track")} />
        <KpiTile label="Needs attention" value={stats.attention.length} sub="Off track 2+ months" accent="border-l-4 border-l-amber-400" active={filter === "attention"} onClick={() => setFilter(filter === "attention" ? "all" : "attention")} />
      </section>

      {!isLoading && (data?.goals.length ?? 0) === 0 ? (
        <Card>
          <EmptyState icon={<Target className="size-5" />} title={`No goals for FY${year} yet`}
            body="Add each department's goals for the year. Monthly actuals, reviews, and the scorecard all build from here."
            action={<Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5" onClick={() => setNewGoal({})}><Plus className="size-4" />Add first goal</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
          <Card className="xl:col-span-3" title="Scorecard" bodyClassName="overflow-x-auto"
            actions={<span className="text-[11px] text-slate-400">Latest reported month vs. target · click a goal to open it</span>}>
            <table className="w-full text-sm table-fixed min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="w-32 px-3 py-2 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Department</th>
                  {prioCols.map((p) => (
                    <th key={p} className="px-2 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ backgroundColor: priorityColor(p, prioCols) }} />{p}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deptRows.map((d) => (
                  <tr key={d} className="align-top">
                    <td className="px-3 py-2">
                      <Link to={`/strategy/departments/${encodeURIComponent(d)}` as any} className="text-sm font-semibold text-slate-800 hover:text-accent-indigo">{d}</Link>
                    </td>
                    {prioCols.map((p) => {
                      const cell = goals.filter((g) => g.department === d && g.priority === p);
                      const shown = cell.filter(visible);
                      return (
                        <td key={p} className="px-2 py-1.5">
                          <div className="space-y-1">
                            {shown.map((g) => <GoalChip key={g.id} goal={g} />)}
                            {cell.length === 0 && filter === "all" && (
                              <button onClick={() => setNewGoal({ department: d, priority: p })}
                                className="w-full h-8 rounded-md border border-dashed border-slate-200 text-[11px] text-slate-300 hover:text-accent-indigo hover:border-accent-indigo/50 transition-colors">+ Add goal</button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-5">
            <Card title={<span className="inline-flex items-center gap-1.5"><AlertTriangle className="size-4 text-amber-500" />Needs attention</span>} bodyClassName="p-2">
              {stats.attention.length === 0 ? <p className="text-xs text-slate-400 px-2 py-3">No goals off track for two or more months.</p> : (
                <ul className="divide-y divide-slate-100">
                  {stats.attention.map((g) => (
                    <li key={g.id}>
                      <Link to={"/strategy/goals/$id" as any} params={{ id: g.id } as any} className="block px-2 py-2 rounded-md hover:bg-slate-50">
                        <p className="text-sm font-medium text-slate-800 truncate">{g.objective}</p>
                        <p className="text-[11px] text-slate-500">{g.department} · off track {offTrackStreak(g)} months</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={<span className="inline-flex items-center gap-1.5"><Rocket className="size-4 text-slate-400" />Initiatives</span>}
              actions={<Link to={"/strategy/initiatives" as any} className="text-xs font-medium text-accent-indigo hover:underline">View all</Link>}>
              {initiatives.length === 0 ? <p className="text-xs text-slate-400">None yet for FY{year}.</p> : (
                <div className="grid grid-cols-2 gap-2 text-center">
                  {["Active", "At risk", "Planned", "Complete"].map((s) => (
                    <div key={s} className="rounded-lg bg-slate-50 py-2">
                      <p className="text-lg font-bold text-slate-900 leading-none">{initiatives.filter((i) => i.status === s).length}</p>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">{s}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title={<span className="inline-flex items-center gap-1.5"><ListChecks className="size-4 text-slate-400" />Coming up</span>}
              actions={<Link to={"/strategy/calendar" as any} className="text-xs font-medium text-accent-indigo hover:underline">Calendar</Link>} bodyClassName="p-2">
              {upcoming.length === 0 ? <p className="text-xs text-slate-400 px-2 py-3">No open activities with due dates.</p> : (
                <ul className="divide-y divide-slate-100">
                  {upcoming.map((a) => (
                    <li key={a.id} className="px-2 py-2">
                      <p className="text-sm text-slate-800 truncate">{a.activity}</p>
                      <p className="text-[11px] text-slate-500 truncate">{fmtDate(a.dueDate)} · {goalById.get(a.goalId)?.objective ?? ""}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
      <GoalDialog open={!!newGoal} onClose={() => setNewGoal(null)} defaults={newGoal ?? undefined}
        onSaved={(id) => navigate({ to: "/strategy/goals/$id" as any, params: { id } as any })} />
    </div>
  );
}

function GoalChip({ goal }: { goal: StrategyGoal }) {
  const status = goalStatus(goal);
  const last = latestReported(goal);
  const st = STATUS_STYLES[status];
  return (
    <Link to={"/strategy/goals/$id" as any} params={{ id: goal.id } as any}
      className="group flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 hover:border-accent-indigo/50 hover:shadow-sm transition-all">
      <span className={`mt-1 size-2 rounded-full shrink-0 ${st.dot}`} title={status} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-slate-800 leading-snug truncate group-hover:text-accent-indigo">{goal.objective}</span>
        <span className="block text-[11px] text-slate-500 truncate">
          {last ? `${MONTHS[last.month]}: ${last.value}` : "No actuals"}{goal.targetValue ? ` · target ${goal.targetValue}` : ""}
        </span>
      </span>
    </Link>
  );
}
