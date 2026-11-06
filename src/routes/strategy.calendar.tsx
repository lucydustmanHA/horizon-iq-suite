import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Rocket, ClipboardList, BarChart3 } from "lucide-react";
import { useStrategyUI, useStrategyYearData, strategyKeys } from "../lib/strategy-hooks";
import { MONTHS, fmtDate } from "../lib/strategy-types";
import { $listDeepDives } from "../lib/strategy.server";
import { PageHeader, Card, LoadError } from "../components/strategy/ui";

export const Route = createFileRoute("/strategy/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Strategy — Horizon QX" }] }),
  component: CalendarPage,
});

type Item = { kind: "activity" | "initiative" | "deepdive"; date: string; title: string; sub: string; href?: string; params?: Record<string, string>; done?: boolean };

function CalendarPage() {
  const year = useStrategyUI((s) => s.year);
  const { data, error } = useStrategyYearData();
  const { data: dives } = useQuery({ queryKey: strategyKeys.deepDives(year), queryFn: () => $listDeepDives({ data: { year } }) });
  const now = new Date();
  const [month, setMonth] = useState(now.getFullYear() === year ? now.getMonth() : 0);

  const goals = data?.goals ?? [];
  const goalById = new Map(goals.map((g) => [g.id, g]));
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const a of data?.activities ?? []) if (a.dueDate) {
      const g = goalById.get(a.goalId);
      out.push({ kind: "activity", date: a.dueDate, title: a.activity, sub: g ? `${g.department} · ${g.objective}` : "", href: "/strategy/goals/$id", params: { id: a.goalId }, done: a.status === "Done" });
    }
    for (const i of data?.initiatives ?? []) if (i.targetDate) out.push({ kind: "initiative", date: i.targetDate, title: i.name, sub: `Initiative target · ${i.owner || i.department || ""}`, href: "/strategy/initiatives", done: i.status === "Complete" });
    for (const d of dives ?? []) if (d.heldOn) out.push({ kind: "deepdive", date: d.heldOn, title: d.name, sub: `Deep dive · ${d.openCount} open of ${d.itemCount} actions`, href: "/strategy/deep-dives" });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [data, dives]); // eslint-disable-line react-hooks/exhaustive-deps

  const inMonth = (d: string) => d.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`);
  const monthItems = items.filter((i) => inMonth(i.date));
  const countFor = (m: number) => items.filter((i) => i.date.startsWith(`${year}-${String(m + 1).padStart(2, "0")}`)).length;
  // Months that have passed (or the current one) should have actuals reported.
  const reportable = year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth());
  const missing = reportable ? goals.filter((g) => !(g.progress[month] ?? "").trim()) : [];

  if (error) return <div className="p-8"><LoadError error={error} /></div>;

  const ICON = { activity: CheckCircle2, initiative: Rocket, deepdive: ClipboardList } as const;
  const TONE = { activity: "text-accent-indigo bg-accent-indigo/10", initiative: "text-accent-orange bg-accent-orange/10", deepdive: "text-violet-600 bg-violet-50" } as const;

  return (
    <div className="p-8 space-y-5">
      <PageHeader title="Calendar" subtitle={`Activity due dates, initiative targets, and deep dives for FY${year}`} />
      <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
        {MONTHS.map((m, i) => {
          const n = countFor(i);
          const isNow = year === now.getFullYear() && i === now.getMonth();
          return (
            <button key={m} onClick={() => setMonth(i)}
              className={`rounded-lg border px-2 py-2 text-left transition-all ${month === i ? "border-accent-indigo bg-white shadow-sm ring-2 ring-accent-indigo/20" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <p className={`text-xs font-semibold ${isNow ? "text-accent-indigo" : "text-slate-700"}`}>{m}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{n ? `${n} item${n === 1 ? "" : "s"}` : "—"}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2" title={`${MONTHS[month]} ${year}`} bodyClassName="p-2">
          {monthItems.length === 0 ? <p className="text-xs text-slate-400 px-3 py-6 text-center">Nothing scheduled this month.</p> : (
            <ul className="divide-y divide-slate-100">
              {monthItems.map((it, idx) => {
                const Icon = ICON[it.kind];
                const body = (
                  <div className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50">
                    <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${TONE[it.kind]}`}><Icon className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${it.done ? "text-slate-400 line-through" : "text-slate-800"}`}>{it.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">{it.sub}</p>
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">{fmtDate(it.date)}</span>
                  </div>
                );
                return <li key={idx}>{it.href ? <Link to={it.href as any} params={it.params as any}>{body}</Link> : body}</li>;
              })}
            </ul>
          )}
        </Card>
        <Card title={<span className="inline-flex items-center gap-1.5"><BarChart3 className="size-4 text-slate-400" />Actuals to report</span>} bodyClassName="p-2">
          {!reportable ? <p className="text-xs text-slate-400 px-3 py-4">{MONTHS[month]} hasn't happened yet.</p>
            : goals.length === 0 ? <p className="text-xs text-slate-400 px-3 py-4">No goals this year.</p>
            : missing.length === 0 ? <p className="text-xs text-emerald-600 px-3 py-4">All {goals.length} goals have {MONTHS[month]} actuals.</p>
            : (
              <>
                <p className="text-[11px] text-slate-500 px-3 pt-2 pb-1">{missing.length} of {goals.length} goals are missing {MONTHS[month]} actuals</p>
                <ul className="divide-y divide-slate-100">
                  {missing.map((g) => (
                    <li key={g.id}>
                      <Link to={"/strategy/goals/$id" as any} params={{ id: g.id } as any} className="block px-3 py-1.5 rounded-md hover:bg-slate-50">
                        <p className="text-sm text-slate-800 truncate">{g.objective}</p>
                        <p className="text-[11px] text-slate-500">{g.department}{g.owner ? ` · ${g.owner}` : ""}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
        </Card>
      </div>
    </div>
  );
}
