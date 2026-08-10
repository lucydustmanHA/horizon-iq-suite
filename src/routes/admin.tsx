import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { DollarSign, Server, Clock, Activity } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Horizon QX" },
      { name: "description", content: "Application cost and resource usage dashboard." },
    ],
  }),
  component: AdminPage,
});

interface CostMetric {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
}

function AdminPage() {
  const [appInfo, setAppInfo] = useState<{ uptime: string; deployments: number; lastDeploy: string }>({
    uptime: "—", deployments: 0, lastDeploy: "—"
  });

  useEffect(() => {
    const firstDeploy = new Date("2026-06-23");
    const now = new Date();
    const days = Math.floor((now.getTime() - firstDeploy.getTime()) / (1000*60*60*24));
    setAppInfo({
      uptime: `${days} days`,
      deployments: 45,
      lastDeploy: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
  }, []);

  const costs: CostMetric[] = [
    { label: "Databricks Apps Compute", value: "$0.07/hr", sub: "1 vCPU, 2 GB RAM (always-on during active use)", icon: Server },
    { label: "Lakebase (Postgres)", value: "$0.10/hr", sub: "Serverless Postgres — scales to zero when idle", icon: Activity },
    { label: "Estimated Monthly Total", value: "~$50–80/mo", sub: "Based on typical business-hours usage pattern", icon: DollarSign, accent: "border-l-4 border-l-emerald-400" },
    { label: "App Uptime", value: appInfo.uptime, sub: "Since first production deployment", icon: Clock },
  ];

  const lineItems = [
    { category: "Compute (Apps Runtime)", description: "Databricks Apps serverless container — 1 vCPU, 2 GB RAM", rate: "$0.07/hr", estimatedMonthly: "$33–50", notes: "Charged only while app is in RUNNING state (auto-sleeps after inactivity)" },
    { category: "Database (Lakebase)", description: "Neon Postgres serverless — production branch", rate: "$0.10/hr active", estimatedMonthly: "$15–25", notes: "Scales to zero after 5 min idle; billed per compute-hour" },
    { category: "Storage (Lakebase)", description: "Database storage for use cases, activity, todos, portfolios", rate: "$0.025/GB-mo", estimatedMonthly: "<$1", notes: "Current DB size ~50MB" },
    { category: "Network/Egress", description: "Data transfer between app and database", rate: "Included", estimatedMonthly: "$0", notes: "Intra-Azure traffic in same region" },
    { category: "Workspace Storage", description: "Source files in Databricks workspace", rate: "Included", estimatedMonthly: "$0", notes: "Part of workspace allocation" },
  ];

  const comparisons = [
    { tool: "This App (Horizon QX)", cost: "~$50–80/mo", notes: "Full custom tracker, unlimited users, no per-seat fee" },
    { tool: "Asana Business", cost: "$300+/mo", notes: "10 users \u00d7 $30.49/user/mo" },
    { tool: "Monday.com Pro", cost: "$200+/mo", notes: "10 users \u00d7 $19/user/mo (min 3 seats)" },
    { tool: "Smartsheet Business", cost: "$250+/mo", notes: "Starts at $25/user/mo for comparable features" },
    { tool: "Power Apps Premium", cost: "$200+/mo", notes: "10 users \u00d7 $20/user/mo" },
  ];

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <DollarSign className="size-6 text-accent-indigo" /> Application Costs
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Breakdown of infrastructure costs to run this application on the Databricks platform.
        </p>
      </header>

      {/* Top KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {costs.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm ${c.accent ?? ""}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="size-4 text-slate-400" />
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{c.label}</p>
              </div>
              <p className="text-2xl font-bold text-slate-900">{c.value}</p>
              {c.sub && <p className="text-[11px] text-slate-400 mt-1 leading-snug">{c.sub}</p>}
            </div>
          );
        })}
      </section>

      {/* Detailed Cost Breakdown */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Cost Breakdown</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-6 py-3 text-left">Category</th>
              <th className="px-6 py-3 text-left">Description</th>
              <th className="px-6 py-3 text-left">Rate</th>
              <th className="px-6 py-3 text-left">Est. Monthly</th>
              <th className="px-6 py-3 text-left">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lineItems.map((item) => (
              <tr key={item.category} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-medium text-slate-800 whitespace-nowrap">{item.category}</td>
                <td className="px-6 py-3 text-slate-600">{item.description}</td>
                <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{item.rate}</td>
                <td className="px-6 py-3 font-medium text-slate-800 whitespace-nowrap">{item.estimatedMonthly}</td>
                <td className="px-6 py-3 text-slate-500 text-xs">{item.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Cost Comparison */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Cost Comparison vs. Alternatives</h2>
          <p className="text-xs text-slate-400 mt-0.5">Estimated monthly cost for comparable portfolio management with ~10 users</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-6 py-3 text-left">Tool</th>
              <th className="px-6 py-3 text-left">Est. Monthly</th>
              <th className="px-6 py-3 text-left">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comparisons.map((c) => (
              <tr key={c.tool} className={`hover:bg-slate-50 ${c.tool.includes("Horizon") ? "bg-emerald-50/50" : ""}`}>
                <td className={`px-6 py-3 font-medium ${c.tool.includes("Horizon") ? "text-emerald-700" : "text-slate-800"}`}>{c.tool}</td>
                <td className={`px-6 py-3 font-medium ${c.tool.includes("Horizon") ? "text-emerald-700" : "text-slate-800"}`}>{c.cost}</td>
                <td className="px-6 py-3 text-slate-500 text-xs">{c.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-slate-400 text-center">
        Costs are estimates based on Databricks pricing as of July 2025. Actual costs depend on usage patterns and may vary.
      </p>
    </div>
  );
}
