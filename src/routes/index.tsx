import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { usePortfolio } from "../lib/store";
import { STAGES } from "../lib/types";
import { StageBadge, PriorityBadge, OwnerAvatar } from "../components/badges";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const fmtHours = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
const fmtMoney = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(0)}k`
      : `$${n}`;

function Dashboard() {
  const useCases = usePortfolio((s) => s.useCases);

  const stats = useMemo(() => {
    const total = useCases.length;
    const activeStages = new Set([
      "Intake",
      "Discovery",
      "Development",
      "Testing & Validation",
      "Deployment",
    ]);
    const active = useCases.filter((u) => activeStages.has(u.stage)).length;
    const completed = useCases.filter((u) => u.stage === "Completed").length;
    const archived = useCases.filter((u) => u.stage === "Archive").length;
    const hours = useCases.reduce((s, u) => s + u.annualTimeSaved, 0);
    const cost = useCases.reduce((s, u) => s + u.costSavings, 0);
    const highRisk = useCases.filter((u) => u.risk >= 4).length;

    // Simple lead time: for Completed, use created→last modified days
    const leadTimes = useCases
      .filter((u) => u.stage === "Completed")
      .map((u) => {
        const c = new Date(u.createdDate).getTime();
        const m = new Date(u.lastModifiedDate).getTime();
        return Math.max(1, Math.round((m - c) / 86_400_000));
      });
    const avgLead = leadTimes.length
      ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
      : 0;

    return { total, active, completed, archived, hours, cost, highRisk, avgLead };
  }, [useCases]);

  const pipelineData = useMemo(
    () =>
      STAGES.map((stage) => ({
        stage: stage.replace(" & Validation", ""),
        count: useCases.filter((u) => u.stage === stage).length,
      })),
    [useCases],
  );

  const workgroupData = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of useCases) map.set(u.workgroup, (map.get(u.workgroup) ?? 0) + 1);
    return Array.from(map.entries())
      .map(([workgroup, count]) => ({ workgroup, count }))
      .sort((a, b) => b.count - a.count);
  }, [useCases]);

  const insights = useMemo(() => {
    const topWg = workgroupData[0];
    const topSavings = [...useCases]
      .sort((a, b) => b.costSavings - a.costSavings)
      .slice(0, 5);
    const topSum = topSavings.reduce((s, u) => s + u.costSavings, 0);
    const totalSum = useCases.reduce((s, u) => s + u.costSavings, 0);
    const pct = totalSum ? Math.round((topSum / totalSum) * 100) : 0;
    const avgReduction =
      useCases.reduce((s, u) => s + (u.effortBefore - u.effortAfter), 0) /
      Math.max(1, useCases.length);
    return [
      {
        tone: "critical",
        label: "PORTFOLIO SIGNAL",
        text: `${topWg?.workgroup ?? "—"} leads with ${topWg?.count ?? 0} active use cases — recommend prioritizing intake capacity there next quarter.`,
      },
      {
        tone: "warn",
        label: "VALUE CONCENTRATION",
        text: `Top 5 use cases generate ${pct}% of estimated portfolio savings.`,
      },
      {
        tone: "info",
        label: "EFFICIENCY METRIC",
        text: `Average effort reduction across delivered work is ${avgReduction.toFixed(1)} points on a 5-point scale.`,
      },
    ] as const;
  }, [useCases, workgroupData]);

  const topPriority = useMemo(
    () =>
      [...useCases]
        .sort((a, b) => b.priority - a.priority || b.risk - a.risk)
        .slice(0, 5),
    [useCases],
  );

  const priorityStages = useMemo(
    () => ({
      "Discovery": useCases.filter((u) => u.stage === "Discovery"),
      "Development": useCases.filter((u) => u.stage === "Development"),
      "Testing & Validation": useCases.filter(
        (u) => u.stage === "Testing & Validation",
      ),
    }),
    [useCases],
  );

  return (
    <div className="p-8 space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Innovation Pipeline</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">
          Portfolio-wide view of AI, automation, and innovation use cases across
          their lifecycle.
        </p>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Kpi label="Total Cases" value={stats.total.toString()} />
        <Kpi label="Active" value={stats.active.toString()} />
        <Kpi
          label="Hours Saved"
          value={fmtHours(stats.hours)}
          valueClass="text-status-success"
        />
        <Kpi label="Cost Savings" value={fmtMoney(stats.cost)} />
        <Kpi
          label="Avg Lead Time"
          value={stats.avgLead ? `${stats.avgLead}d` : "—"}
        />
        <Kpi
          label="High Risk"
          value={stats.highRisk.toString()}
          valueClass="text-status-danger"
          accent="border-l-4 border-l-status-danger"
        />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Pipeline by Stage</h2>
            <span className="text-xs font-mono text-slate-400">LIVE</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="stage"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(79,70,229,0.06)" }}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {pipelineData.map((d, i) => (
                    <Cell
                      key={d.stage}
                      fill={
                        i < 2
                          ? "#94a3b8"
                          : i < 5
                            ? "#4f46e5"
                            : i === 6
                              ? "#10b981"
                              : "#cbd5e1"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-brand text-brand-foreground p-6 rounded-xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent-indigo/25 blur-3xl pointer-events-none" />
          <h2 className="font-semibold mb-4 flex items-center gap-2 relative">
            <span className="size-2 rounded-full bg-accent-indigo animate-pulse" />
            AI Insights
          </h2>
          <div className="space-y-3 relative">
            {insights.map((ins) => (
              <div
                key={ins.label}
                className="p-3 bg-white/5 border border-white/10 rounded-lg"
              >
                <p
                  className={
                    "text-[10px] font-mono mb-1 " +
                    (ins.tone === "critical"
                      ? "text-accent-indigo"
                      : ins.tone === "warn"
                        ? "text-status-warning"
                        : "text-status-success")
                  }
                >
                  {ins.label}
                </p>
                <p className="text-sm text-slate-200 leading-snug">{ins.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <h2 className="font-semibold">Top Priority Use Cases</h2>
          <Link
            to="/use-cases"
            className="text-xs font-medium text-accent-indigo hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="px-6 py-3">Use Case</th>
                <th className="px-6 py-3">Stage</th>
                <th className="px-6 py-3">Priority</th>
                <th className="px-6 py-3">Workgroup</th>
                <th className="px-6 py-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topPriority.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <Link
                      to="/use-cases/$id"
                      params={{ id: u.id }}
                      className="font-medium text-sm text-slate-900 hover:text-accent-indigo"
                    >
                      {u.title}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">{u.id}</p>
                  </td>
                  <td className="px-6 py-4">
                    <StageBadge stage={u.stage} />
                  </td>
                  <td className="px-6 py-4">
                    <PriorityBadge priority={u.priority} />
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-600">
                    {u.workgroup}
                  </td>
                  <td className="px-6 py-4">
                    <OwnerAvatar name={u.useCaseOwner} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {(
          [
            ["Discovery", priorityStages.Discovery],
            ["Development", priorityStages.Development],
            ["Testing & Validation", priorityStages["Testing & Validation"]],
          ] as const
        ).map(([label, list]) => (
          <div key={label} className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              {label} ({list.length})
            </p>
            {list.slice(0, 3).map((u) => (
              <Link
                key={u.id}
                to="/use-cases/$id"
                params={{ id: u.id }}
                className="block p-4 bg-white border border-slate-200 rounded-lg shadow-sm hover:ring-1 hover:ring-accent-indigo/20 transition"
              >
                <p className="text-xs font-medium mb-2 line-clamp-2 text-slate-900">
                  {u.title}
                </p>
                <div className="flex items-center justify-between">
                  <PriorityBadge priority={u.priority} />
                  <OwnerAvatar name={u.useCaseOwner} size={20} />
                </div>
              </Link>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  valueClass = "",
  accent = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
  accent?: string;
}) {
  return (
    <div
      className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm ${accent}`}
    >
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold text-slate-900 ${valueClass}`}>{value}</p>
    </div>
  );
}
