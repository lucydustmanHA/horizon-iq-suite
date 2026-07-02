
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { usePortfolio } from "../lib/store";
import { STAGES } from "../lib/types";
import { StageBadge, PriorityBadge, OwnerAvatar, FlagBadge } from "../components/badges";

export const Route = createFileRoute("/")({ component: Dashboard });

const fmtHours = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
const fmtMoney = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${Math.round(n)}%`;

function Dashboard() {
  const useCases = usePortfolio((s) => s.useCases);

  const stats = useMemo(() => {
    const total = useCases.length;
    const active = useCases.filter((u) => ["Intake","Discovery","Development","Testing & Validation","Deployment"].includes(u.stage)).length;
    const completed = useCases.filter((u) => u.stage === "Completed").length;
    const priority2026 = useCases.filter((u) => u.priority === 1).length;
    const completed2026 = useCases.filter((u) => u.priority === 1 && u.stage === "Completed").length;
    const pct2026Complete = priority2026 > 0 ? (completed2026 / priority2026) * 100 : 0;
    const flagged = useCases.filter((u) => u.status === "Blocked" || u.status === "Action Needed").length;

    // Only use seeded/user-entered data (exclude zeroes from avg calculations)
    const withTime = useCases.filter((u) => (u.annualTimeSaved ?? 0) > 0);
    const withCost = useCases.filter((u) => (u.costSavings ?? 0) > 0);
    const totalTimeSaved = withTime.reduce((s, u) => s + u.annualTimeSaved, 0);
    const totalCost = withCost.reduce((s, u) => s + u.costSavings, 0);

    // Avg lead time: only completed cases with real data
    const leadTimes = useCases.filter((u) => u.stage === "Completed").map((u) => {
      const c = new Date(u.createdDate).getTime();
      const m = new Date(u.lastModifiedDate).getTime();
      return Math.max(1, Math.round((m - c) / 86_400_000));
    }).filter((d) => d < 1000); // sanity cap
    const avgLead = leadTimes.length ? (leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) : 0;

    // % proactive: use cases marked proactive (proactivePct > 50) / total with data
    const withProactive = useCases.filter((u) => (u.proactivePct ?? 0) > 0);
    const proactiveCount = withProactive.filter((u) => u.proactivePct > 50).length;
    const pctProactive = withProactive.length > 0 ? (proactiveCount / withProactive.length) * 100 : 0;

    // Avg effort reduction: only cases with real before/after data
    const withEffort = useCases.filter((u) => (u.effortBefore ?? 0) > 0 && (u.effortAfter ?? 0) > 0 && u.effortBefore > u.effortAfter);
    const avgEffortReduction = withEffort.length
      ? withEffort.reduce((s, u) => s + (u.effortBefore - u.effortAfter), 0) / withEffort.length / 4 * 100
      : 0;

    return { total, active, completed, priority2026, completed2026, pct2026Complete, flagged, totalTimeSaved, totalCost, avgLead, pctProactive, avgEffortReduction };
  }, [useCases]);

  const pipelineData = useMemo(() => STAGES.map((stage) => ({
    stage: stage.replace(" & Validation", ""),
    count: useCases.filter((u) => u.stage === stage).length,
  })), [useCases]);

  const workgroupData = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of useCases) map.set(u.workgroup, (map.get(u.workgroup) ?? 0) + 1);
    return Array.from(map.entries()).map(([workgroup, count]) => ({ workgroup, count })).sort((a, b) => b.count - a.count);
  }, [useCases]);

  const insights = useMemo(() => {
    const topWg = workgroupData[0];
    const topSavings = [...useCases].sort((a, b) => b.costSavings - a.costSavings).slice(0, 5);
    const topSum = topSavings.reduce((s, u) => s + u.costSavings, 0);
    const totalSum = useCases.reduce((s, u) => s + u.costSavings, 0);
    const pct = totalSum ? Math.round((topSum / totalSum) * 100) : 0;
    return [
      { tone: "critical" as const, label: "PORTFOLIO SIGNAL", text: `${topWg?.workgroup ?? "—"} leads with ${topWg?.count ?? 0} use cases across all stages.` },
      { tone: "warn" as const, label: "VALUE CONCENTRATION", text: `Top 5 use cases represent ${pct}% of total portfolio savings.` },
      { tone: "info" as const, label: "2026 COMPLETION", text: `${stats.completed2026} of ${stats.priority2026} priority 2026 items completed (${Math.round(stats.pct2026Complete)}%).` },
    ];
  }, [useCases, workgroupData, stats]);

  const topPriority = useMemo(() =>
    [...useCases].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99) || b.costSavings - a.costSavings).slice(0, 8),
    [useCases]);

  return (
    <div className="p-8 space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Innovation Pipeline</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl">Portfolio-wide view of AI, automation, and innovation use cases.</p>
      </section>

      {/* Row 1: Primary KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Annual Time Saved" value={fmtHours(stats.totalTimeSaved) + " hrs"} valueClass="text-status-success" accent="border-l-4 border-l-status-success" />
        <Kpi label="Total Cost Savings" value={fmtMoney(stats.totalCost)} valueClass="text-emerald-600" accent="border-l-4 border-l-emerald-400" />
        <Kpi label="Completed" value={stats.completed.toString()} sub={`${Math.round(stats.pct2026Complete)}% of 2026 priority`} />
        <Kpi label="Flagged" value={stats.flagged.toString()} valueClass={stats.flagged > 0 ? "text-amber-600" : ""} accent={stats.flagged > 0 ? "border-l-4 border-l-amber-400" : ""} />
      </section>

      {/* Row 2: Other KPIs */}
      <section>
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Other KPIs <span className="normal-case font-normal text-slate-300 ml-1">(based on user-entered data per use case)</span></h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Avg Dev Lead Time" value={stats.avgLead ? `${stats.avgLead.toFixed(0)} days` : "—"} desc="Time from development start → completion" />
          <KpiCard label="% Proactive Work" value={stats.pctProactive > 0 ? fmtPct(stats.pctProactive) : "—"} desc="Use cases marked proactive / total with data" />
          <KpiCard label="Avg Effort Reduction" value={stats.avgEffortReduction > 0 ? fmtPct(stats.avgEffortReduction) : "—"} desc="Owner-rated effort before vs. after" />
          <Kpi label="Total Use Cases" value={stats.total.toString()} sub={`${stats.active} active`} />
        </div>
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
                <XAxis dataKey="stage" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(79,70,229,0.06)" }} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {pipelineData.map((d, i) => <Cell key={d.stage} fill={i < 2 ? "#94a3b8" : i < 5 ? "#4f46e5" : i === 6 ? "#10b981" : "#cbd5e1"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-brand text-brand-foreground p-6 rounded-xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent-indigo/25 blur-3xl pointer-events-none" />
          <h2 className="font-semibold mb-4 flex items-center gap-2 relative"><span className="size-2 rounded-full bg-accent-indigo animate-pulse" /> AI Insights</h2>
          <div className="space-y-3 relative">
            {insights.map((ins) => (
              <div key={ins.label} className="p-3 bg-white/5 border border-white/10 rounded-lg">
                <p className={"text-[10px] font-mono mb-1 " + (ins.tone === "critical" ? "text-accent-indigo" : ins.tone === "warn" ? "text-status-warning" : "text-status-success")}>{ins.label}</p>
                <p className="text-sm text-slate-200 leading-snug">{ins.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Priority table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <h2 className="font-semibold">Top Priority Use Cases</h2>
          <Link to="/use-cases" className="text-xs font-medium text-accent-indigo hover:underline">View all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
              <th className="px-6 py-3">Use Case</th><th className="px-6 py-3">Stage</th><th className="px-6 py-3">Priority</th><th className="px-6 py-3">Flags</th><th className="px-6 py-3">Workgroup</th><th className="px-6 py-3">Owner</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {topPriority.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4"><Link to="/use-cases/$id" params={{ id: u.id }} className="font-medium text-sm text-slate-900 hover:text-accent-indigo">{u.title}</Link><p className="text-xs text-slate-500 mt-0.5">{u.id}</p></td>
                  <td className="px-6 py-4"><StageBadge stage={u.stage} /></td>
                  <td className="px-6 py-4"><PriorityBadge priority={u.priority} /></td>
                  <td className="px-6 py-4"><FlagBadge status={u.status} /></td>
                  <td className="px-6 py-4 text-xs text-slate-600">{u.workgroup}</td>
                  <td className="px-6 py-4"><OwnerAvatar name={u.useCaseOwner} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, valueClass = "", accent = "", sub }: { label: string; value: string; valueClass?: string; accent?: string; sub?: string }) {
  return <div className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm ${accent}`}><p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p><p className={`text-2xl font-bold text-slate-900 ${valueClass}`}>{value}</p>{sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}</div>;
}
function KpiCard({ label, value, desc }: { label: string; value: string; desc: string }) {
  return <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm"><p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p><p className="text-xl font-bold text-accent-indigo">{value}</p><p className="text-[10px] text-slate-400 mt-1 leading-snug">{desc}</p></div>;
}
