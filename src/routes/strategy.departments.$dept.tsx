import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Building2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { useStrategyUI, useStrategyYearData, useStrategyOptions } from "../lib/strategy-hooks";
import { goalStatus, goalMatches, priorityRank, sortPriorities, MONTHS, type GoalStatus } from "../lib/strategy-types";
import { PageHeader, Card, EmptyState, GoalDialog, StatusPill, PriorityTag, MonthStrip, LoadError } from "../components/strategy/ui";

export const Route = createFileRoute("/strategy/departments/$dept")({
  head: () => ({ meta: [{ title: "Department — Strategy — Horizon QX" }] }),
  component: DepartmentPage,
});

function DepartmentPage() {
  const { dept: rawDept } = Route.useParams();
  const dept = decodeURIComponent(rawDept);
  const navigate = useNavigate();
  const { year, search } = useStrategyUI();
  const { data, isLoading, error } = useStrategyYearData();
  const { priorities } = useStrategyOptions();
  const [prio, setPrio] = useState<string>("all");
  const [newOpen, setNewOpen] = useState(false);

  const all = useMemo(() => (data?.goals ?? [])
    .filter((g) => g.department === dept && goalMatches(search, g))
    .sort((a, b) => priorityRank(a.priority, priorities) - priorityRank(b.priority, priorities) || a.objective.localeCompare(b.objective)),
    [data, dept, search, priorities]);
  const goals = all.filter((g) => prio === "all" || g.priority === prio);
  const count = (s: GoalStatus) => all.filter((g) => goalStatus(g) === s).length;
  const prioList = sortPriorities(Array.from(new Set([...priorities, ...all.map((g) => g.priority)])).filter(Boolean), priorities);

  if (error) return <div className="p-8"><LoadError error={error} /></div>;

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title={dept}
        subtitle={`FY${year} goals · ${count("On track")} on track · ${count("Off track")} off track`}
        actions={<Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5" onClick={() => setNewOpen(true)}><Plus className="size-4" />Add goal</Button>}
      />

      {all.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {["all", ...prioList].map((p) => (
            <button key={p} onClick={() => setPrio(p)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${prio === p ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
              {p === "all" ? `All (${all.length})` : `${p} (${all.filter((g) => g.priority === p).length})`}
            </button>
          ))}
        </div>
      )}

      <Card bodyClassName="overflow-x-auto">
        {!isLoading && all.length === 0 ? (
          <EmptyState icon={<Building2 className="size-5" />} title={`No ${dept} goals for FY${year}`}
            body="Add a goal for each strategic priority so this department shows up on the scorecard."
            action={<Button variant="outline" className="gap-1.5" onClick={() => setNewOpen(true)}><Plus className="size-4" />Add goal</Button>} />
        ) : (
          <table className="w-full text-sm min-w-[1180px]">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left w-[22%]">Goal</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-left">Baseline → Target</th>
                <th className="px-3 py-2 text-left w-[44%]">
                  <div className="grid grid-cols-[repeat(12,minmax(2.75rem,1fr))] gap-1 font-medium normal-case">{MONTHS.map((m) => <span key={m} className="text-center">{m}</span>)}</div>
                </th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {goals.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate({ to: "/strategy/goals/$id" as any, params: { id: g.id } as any })}>
                  <td className="px-4 py-2.5">
                    <PriorityTag name={g.priority} all={prioList} />
                    <Link to={"/strategy/goals/$id" as any} params={{ id: g.id } as any} className="block font-semibold text-slate-900 hover:text-accent-indigo mt-0.5" onClick={(e) => e.stopPropagation()}>{g.objective}</Link>
                    {g.description && <p className="text-xs text-slate-500 line-clamp-1">{g.description}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{g.owner || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-700"><span className="block max-w-[11rem] truncate" title={`${g.baselineValue || "—"} → ${g.targetValue || "—"}`}>{g.baselineValue || "—"} <span className="text-slate-300">→</span> <span className="font-medium">{g.targetValue || "—"}</span></span></td>
                  <td className="px-3 py-2.5"><MonthStrip goal={g} /></td>
                  <td className="px-3 py-2.5"><StatusPill status={goalStatus(g)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <GoalDialog open={newOpen} onClose={() => setNewOpen(false)} defaults={{ department: dept }}
        onSaved={(id) => navigate({ to: "/strategy/goals/$id" as any, params: { id } as any })} />
    </div>
  );
}
