import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Play, FileText, Presentation } from "lucide-react";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useStrategyUI, useStrategyOptions, useReviewGoals, useReviews, validateReviewSearch, type ReviewSearch } from "../lib/strategy-hooks";
import { MONTHS, goalStatus, offTrackStreak, monthKey, formatMonthKey, defaultReviewMonth, type StrategyGoal } from "../lib/strategy-types";
import { PageHeader, Card, KpiTile, EmptyState, StatusPill, PriorityTag, LoadError } from "../components/strategy/ui";

export const Route = createFileRoute("/strategy/review/")({
  validateSearch: validateReviewSearch,
  head: () => ({ meta: [{ title: "Leadership Review — Strategy — Horizon QX" }] }),
  component: ReviewHome,
});

function ReviewHome() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const year = useStrategyUI((s) => s.year);
  const month = search.month && search.month.startsWith(String(year)) ? search.month : defaultReviewMonth(year);
  const { departments } = useStrategyOptions();
  const { goals, isLoading, error } = useReviewGoals(search.dept);
  const { data: reviews = [] } = useReviews(month);
  const byGoal = new Map(reviews.map((r) => [r.goalId, r]));
  // One slide per department, in review order
  const slideDepts = Array.from(new Set(goals.map((g) => g.department)));
  const slideOf = (g: StrategyGoal) => Math.max(0, slideDepts.indexOf(g.department));
  const on = goals.filter((g) => goalStatus(g) === "On track").length;
  const off = goals.filter((g) => goalStatus(g) === "Off track").length;
  const attention = goals.filter((g) => offTrackStreak(g) >= 2).length;
  const setSearch = (patch: ReviewSearch) => navigate({ to: "/strategy/review" as any, search: { month, dept: search.dept, ...patch } as any, replace: true });
  const go = (to: string) => navigate({ to: to as any, search: { month, dept: search.dept } as any });

  if (error) return <div className="p-8"><LoadError error={error} /></div>;

  return (
    <div className="p-8 space-y-5">
      <PageHeader title="Leadership Review" subtitle={`Monthly goal review · ${formatMonthKey(month)}${search.dept ? ` · ${search.dept}` : ""}`}
        actions={<>
          <Button variant="outline" className="gap-1.5" onClick={() => go("/strategy/review/report")} disabled={!goals.length}><FileText className="size-4" />Report / PDF</Button>
          <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5" onClick={() => go("/strategy/review/present")} disabled={!goals.length}><Play className="size-4" />Start review</Button>
        </>} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={month} onValueChange={(v) => setSearch({ month: v })}>
          <SelectTrigger className="h-9 w-40 bg-white text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((_, i) => <SelectItem key={i} value={monthKey(year, i)}>{formatMonthKey(monthKey(year, i))}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={search.dept ?? "__all__"} onValueChange={(v) => setSearch({ dept: v === "__all__" ? undefined : v })}>
          <SelectTrigger className="h-9 w-44 bg-white text-sm"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="__all__">All departments</SelectItem>{departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Slides" value={slideDepts.length} sub={`${goals.length} goals · one slide per department`} />
        <KpiTile label="On track" value={on} accent="border-l-4 border-l-emerald-400" />
        <KpiTile label="Off track" value={off} accent="border-l-4 border-l-red-400" />
        <KpiTile label="Needs attention" value={attention} sub="Off track 2+ months" accent="border-l-4 border-l-amber-400" />
      </section>

      <Card bodyClassName="overflow-x-auto">
        {!isLoading && goals.length === 0 ? (
          <EmptyState icon={<Presentation className="size-5" />} title="No goals to review" body={`Add FY${year} goals first, then walk through them here each month.`} />
        ) : (
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left w-14">Slide</th>
                <th className="px-3 py-2 text-left">Goal</th>
                <th className="px-3 py-2 text-left">Department</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left w-[30%]">Meeting notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {goals.map((g) => {
                const r = byGoal.get(g.id);
                const streak = offTrackStreak(g);
                return (
                  <tr key={g.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate({ to: "/strategy/review/present" as any, search: { month, dept: search.dept, i: slideOf(g) } as any })}>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{slideOf(g) + 1}</td>
                    <td className="px-3 py-2.5">
                      <PriorityTag name={g.priority} />
                      <p className="font-semibold text-slate-900">{g.objective}</p>
                      {streak >= 2 && <p className="text-[11px] text-amber-700">Off track {streak} months running</p>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{g.department}</td>
                    <td className="px-3 py-2.5"><StatusPill status={goalStatus(g)} /></td>
                    <td className="px-3 py-2.5 text-xs text-slate-600"><span className="line-clamp-2">{r?.meetingNotes || <span className="text-slate-300">—</span>}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
