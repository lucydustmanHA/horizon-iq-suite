import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { X, Printer } from "lucide-react";
import { Button } from "../components/ui/button";
import { useStrategyUI, useReviewGoals, useReviews, validateReviewSearch } from "../lib/strategy-hooks";
import {
  goalStatus, monthStatus, offTrackStreak, formatMonthKey, defaultReviewMonth, MONTHS, STATUS_STYLES, goalStatus as statusOf, type StrategyGoal,
} from "../lib/strategy-types";
import { StatusPill } from "../components/strategy/ui";

export const Route = createFileRoute("/strategy/review/report")({
  validateSearch: validateReviewSearch,
  head: () => ({ meta: [{ title: "Leadership Review Report — Horizon QX" }] }),
  component: ReviewReport,
});

// Print only the report; the overlay becomes normal flow so long reports paginate.
const PRINT_CSS = `
@media print {
  @page { size: letter landscape; margin: 0.5in; }
  body * { visibility: hidden !important; }
  #strategy-report, #strategy-report * { visibility: visible !important; }
  #strategy-report { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; overflow: visible !important; background: white !important; }
  #strategy-report .no-print { display: none !important; }
  #strategy-report .avoid-break { break-inside: avoid; }
  #strategy-report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

function ReviewReport() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const year = useStrategyUI((s) => s.year);
  const month = search.month ?? defaultReviewMonth(year);
  const monthIdx = Number(month.slice(5, 7)) - 1;
  const { goals, isLoading } = useReviewGoals(search.dept);
  const { data: reviews = [] } = useReviews(month);
  const byGoal = new Map(reviews.map((r) => [r.goalId, r]));
  const counts = {
    on: goals.filter((g: StrategyGoal) => statusOf(g) === "On track").length,
    off: goals.filter((g: StrategyGoal) => statusOf(g) === "Off track").length,
    attention: goals.filter((g: StrategyGoal) => offTrackStreak(g) >= 2).length,
  };
  const risks = goals.filter((g) => offTrackStreak(g) >= 2);
  const depts = Array.from(new Set(goals.map((g) => g.department)));
  const generated = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div id="strategy-report" className="fixed inset-0 z-50 bg-slate-100 overflow-y-auto">
      <style>{PRINT_CSS}</style>
      <div className="no-print sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Leadership Review Report · {formatMonthKey(month)}</p>
        <div className="flex gap-2">
          <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5" onClick={() => window.print()} disabled={isLoading}><Printer className="size-4" />Print / Save as PDF</Button>
          <Button variant="ghost" className="gap-1" onClick={() => navigate({ to: "/strategy/review" as any, search: { month, dept: search.dept } as any })}><X className="size-4" />Close</Button>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto my-6 bg-white shadow-sm print:shadow-none print:my-0 p-10 print:p-0 space-y-6">
        <header className="flex items-end justify-between border-b-2 border-slate-900 pb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-accent-indigo">Horizon Air · Business Transformation</p>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">Leadership Review — {formatMonthKey(month)}</h1>
            <p className="text-sm text-slate-500">FY{year} strategic goals{search.dept ? ` · ${search.dept}` : " · all departments"}</p>
          </div>
          <p className="text-xs text-slate-400">Generated {generated}</p>
        </header>

        {isLoading ? <p className="text-sm text-slate-400">Loading…</p> : (
          <>
            <section className="grid grid-cols-4 gap-3 avoid-break">
              {([["Goals", goals.length, "bg-slate-400"], ["On track", counts.on, "bg-emerald-500"], ["Off track", counts.off, "bg-red-500"], ["Off track 2+ months", counts.attention, "bg-amber-500"]] as const).map(([l, n, dot]) => (
                <div key={l} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${dot}`} /><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</span></div>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{n}</p>
                </div>
              ))}
            </section>

            {risks.length > 0 && (
              <section className="avoid-break rounded-lg border border-red-200 bg-red-50/50 p-4">
                <h2 className="text-sm font-bold text-red-800">Risks needing leadership attention ({risks.length})</h2>
                <ul className="mt-2 space-y-1.5">
                  {risks.map((g) => {
                    const streak = offTrackStreak(g);
                    const notes = byGoal.get(g.id)?.meetingNotes;
                    return (
                      <li key={g.id} className="text-sm">
                        <span className="font-semibold text-slate-900">{g.department} — {g.objective}</span>
                        <span className="text-slate-500"> · off track {streak} consecutive months</span>
                        {notes && <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{notes}</p>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {depts.map((d) => (
              <section key={d} className="avoid-break">
                <h2 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-1 mb-2">{d}</h2>
                <table className="w-full text-[12px]">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                    <tr className="border-b border-slate-200">
                      <th className="py-1.5 pr-2 text-left w-[26%]">Goal</th>
                      <th className="py-1.5 px-2 text-left w-[14%]">Monthly metric</th>
                      <th className="py-1.5 px-2 text-left">Owner</th>
                      <th className="py-1.5 px-2 text-left">Target</th>
                      <th className="py-1.5 px-2 text-left w-[22%]">Jan – {MONTHS[monthIdx]}</th>
                      <th className="py-1.5 px-2 text-left">Status</th>
                      <th className="py-1.5 pl-2 text-left w-[24%]">Meeting notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {goals.filter((g) => g.department === d).map((g) => (
                      <tr key={g.id} className="align-top avoid-break">
                        <td className="py-2 pr-2"><p className="text-[10px] text-slate-400">{g.priority}</p><p className="font-semibold text-slate-900">{g.objective}</p>{g.description && <p className="text-[11px] text-slate-600 mt-0.5">{g.description}</p>}</td>
                        <td className="py-2 px-2 text-slate-700">{g.monthlyMetric || "—"}</td>
                        <td className="py-2 px-2 text-slate-700">{g.owner || "—"}</td>
                        <td className="py-2 px-2 text-slate-700 whitespace-nowrap">{g.targetValue || "—"}</td>
                        <td className="py-2 px-2">
                          <div className="flex gap-0.5">
                            {g.progress.slice(0, monthIdx + 1).map((v, i) => {
                              const st = STATUS_STYLES[monthStatus(g, i)];
                              const c = g.monthComments?.[i];
                              return <span key={i} title={`${MONTHS[i]}: ${v || "not reported"}${c ? `\n${c}` : ""}`} className={`flex-1 min-w-0 h-5 rounded-sm text-[9px] flex items-center justify-center truncate ${st.cell}`}>{v}</span>;
                            })}
                          </div>
                        </td>
                        <td className="py-2 px-2"><StatusPill status={goalStatus(g)} /></td>
                        <td className="py-2 pl-2 text-slate-600 whitespace-pre-line">{byGoal.get(g.id)?.meetingNotes || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
            {goals.length === 0 && <p className="text-sm text-slate-400">No goals in scope.</p>}
          </>
        )}
      </div>
    </div>
  );
}
