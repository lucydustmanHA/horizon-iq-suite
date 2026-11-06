/**
 * CostsPanel — the former /admin page content, now a tab in Settings & Admin.
 * Figures carried over unchanged from the original Admin page.
 */
import { useEffect, useState } from "react";
import { DollarSign, Server, Clock, Activity } from "lucide-react";

interface CostMetric { label: string; value: string; sub?: string; icon: React.ElementType; accent?: string }

export function CostsPanel() {
  const [uptime, setUptime] = useState("—");
  useEffect(() => {
    const days = Math.floor((Date.now() - new Date("2026-06-23").getTime()) / 86_400_000);
    setUptime(`${days} days`);
  }, []);

  const costs: CostMetric[] = [
    { label: "Databricks Apps Compute", value: "$0.07/hr", sub: "1 vCPU, 2 GB RAM (always-on during active use)", icon: Server },
    { label: "Lakebase (Postgres)", value: "$0.10/hr", sub: "Serverless Postgres — scales to zero when idle", icon: Activity },
    { label: "Estimated Monthly Total", value: "~$50–80/mo", sub: "One app for Strategy and AI & Automation", icon: DollarSign, accent: "border-l-4 border-l-emerald-400" },
    { label: "App Uptime", value: uptime, sub: "Since first production deployment", icon: Clock },
  ];

  const lineItems = [
    { category: "Compute (Apps Runtime)", description: "Databricks Apps serverless container — 1 vCPU, 2 GB RAM", rate: "$0.07/hr", estimatedMonthly: "$33–50", notes: "Charged only while app is in RUNNING state (auto-sleeps after inactivity)" },
    { category: "Database (Lakebase)", description: "Serverless Postgres — production branch", rate: "$0.10/hr active", estimatedMonthly: "$15–25", notes: "Scales to zero after 5 min idle; billed per compute-hour" },
    { category: "Storage (Lakebase)", description: "Use cases, activity, to-dos, portfolios, strategy goals and reviews", rate: "$0.025/GB-mo", estimatedMonthly: "<$1", notes: "Current DB size ~50MB" },
    { category: "Network/Egress", description: "Data transfer between app and database", rate: "Included", estimatedMonthly: "$0", notes: "Intra-Azure traffic in same region" },
    { category: "Workspace Storage", description: "Source files in Databricks workspace", rate: "Included", estimatedMonthly: "$0", notes: "Part of workspace allocation" },
  ];

  const comparisons = [
    { tool: "This App (Horizon QX)", cost: "~$50–80/mo", notes: "Strategy + AI & Automation in one app, unlimited users, no per-seat fee" },
    { tool: "Asana Business", cost: "$300+/mo", notes: "10 users × $30.49/user/mo" },
    { tool: "Monday.com Pro", cost: "$200+/mo", notes: "10 users × $19/user/mo (min 3 seats)" },
    { tool: "Smartsheet Business", cost: "$250+/mo", notes: "Starts at $25/user/mo for comparable features" },
    { tool: "Power Apps Premium", cost: "$200+/mo", notes: "10 users × $20/user/mo" },
  ];

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {costs.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm ${c.accent ?? ""}`}>
              <div className="flex items-center gap-2 mb-1.5"><Icon className="size-4 text-slate-400" /><p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{c.label}</p></div>
              <p className="text-xl font-bold text-slate-900">{c.value}</p>
              {c.sub && <p className="text-[11px] text-slate-400 mt-1 leading-snug">{c.sub}</p>}
            </div>
          );
        })}
      </section>
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-700">Cost Breakdown</h2></div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
            <tr><th className="px-5 py-2 text-left">Category</th><th className="px-5 py-2 text-left">Description</th><th className="px-5 py-2 text-left">Rate</th><th className="px-5 py-2 text-left">Est. Monthly</th><th className="px-5 py-2 text-left">Notes</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lineItems.map((i) => (
              <tr key={i.category} className="hover:bg-slate-50">
                <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{i.category}</td>
                <td className="px-5 py-2.5 text-slate-600">{i.description}</td>
                <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap">{i.rate}</td>
                <td className="px-5 py-2.5 font-medium text-slate-800 whitespace-nowrap">{i.estimatedMonthly}</td>
                <td className="px-5 py-2.5 text-slate-500 text-xs">{i.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Cost Comparison vs. Alternatives</h2>
          <p className="text-xs text-slate-400 mt-0.5">Estimated monthly cost for comparable portfolio management with ~10 users</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide"><tr><th className="px-5 py-2 text-left">Tool</th><th className="px-5 py-2 text-left">Est. Monthly</th><th className="px-5 py-2 text-left">Notes</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {comparisons.map((c) => {
              const us = c.tool.includes("Horizon");
              return (
                <tr key={c.tool} className={`hover:bg-slate-50 ${us ? "bg-emerald-50/50" : ""}`}>
                  <td className={`px-5 py-2.5 font-medium ${us ? "text-emerald-700" : "text-slate-800"}`}>{c.tool}</td>
                  <td className={`px-5 py-2.5 font-medium ${us ? "text-emerald-700" : "text-slate-800"}`}>{c.cost}</td>
                  <td className="px-5 py-2.5 text-slate-500 text-xs">{c.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-400 text-center">Costs are estimates based on Databricks pricing as of July 2025. Actual costs depend on usage patterns and may vary.</p>
    </div>
  );
}
