import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePortfolio } from "../lib/store";
import { Sparkles, TrendingUp, AlertTriangle, Target } from "lucide-react";

export const Route = createFileRoute("/insights")({
  head: () => ({
    meta: [
      { title: "Insights — Horizon QX" },
      { name: "description", content: "Automated portfolio insights across AI and automation use cases." },
    ],
  }),
  component: InsightsPage,
});

function InsightsPage() {
  const useCases = usePortfolio((s) => s.useCases);

  const insights = useMemo(() => {
    const wgCount = new Map<string, number>();
    for (const u of useCases) wgCount.set(u.workgroup, (wgCount.get(u.workgroup) ?? 0) + 1);
    const topWg = [...wgCount.entries()].sort((a, b) => b[1] - a[1])[0];
    const totalActive = useCases.filter((u) =>
      ["Intake", "Discovery", "Development", "Testing & Validation", "Deployment"].includes(u.stage),
    ).length;
    const topSavings = [...useCases].sort((a, b) => b.costSavings - a.costSavings).slice(0, 5);
    const topSum = topSavings.reduce((s, u) => s + u.costSavings, 0);
    const totalSum = useCases.reduce((s, u) => s + u.costSavings, 0);
    const blocked = useCases.filter((u) => u.status === "Blocked").length;
    const highRisk = useCases.filter((u) => u.risk >= 4).length;
    const proactive = useCases.reduce((s, u) => s + u.proactivePct, 0) / Math.max(1, useCases.length);
    const effortReduction = useCases.reduce((s, u) => s + (u.effortBefore - u.effortAfter), 0) / Math.max(1, useCases.length);

    return [
      {
        icon: TrendingUp,
        tone: "success" as const,
        title: "Where the pipeline is concentrating",
        body: `${topWg?.[0] ?? "—"} has the highest number of active use cases (${topWg?.[1] ?? 0}). Recommend allocating additional intake capacity there next quarter.`,
      },
      {
        icon: Target,
        tone: "info" as const,
        title: "Top value concentration",
        body: `The top 5 use cases generate ${totalSum ? Math.round((topSum / totalSum) * 100) : 0}% of the portfolio's estimated savings ($${topSum.toLocaleString()}). Consider dedicated executive sponsorship for these.`,
      },
      {
        icon: Sparkles,
        tone: "info" as const,
        title: "Effort reduction is meaningful",
        body: `Average effort reduction across delivered work is ${effortReduction.toFixed(1)} points on a 5-point scale. Portfolio proactive vs reactive split sits at ${Math.round(proactive)}% / ${100 - Math.round(proactive)}%.`,
      },
      {
        icon: AlertTriangle,
        tone: "warn" as const,
        title: "Risk & blockers requiring action",
        body: `${highRisk} high-risk use cases and ${blocked} currently blocked. Recommend a portfolio triage review this cycle. ${totalActive} total use cases are in active stages.`,
      },
    ];
  }, [useCases]);

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="size-6 text-accent-indigo" /> Portfolio Insights
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Automated insights generated from your current portfolio. AI-powered recommendations and forecasting arrive in the next iteration.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.map((ins) => {
          const Icon = ins.icon;
          const border =
            ins.tone === "success"
              ? "border-l-status-success"
              : ins.tone === "warn"
                ? "border-l-status-warning"
                : "border-l-accent-indigo";
          return (
            <div
              key={ins.title}
              className={`bg-white p-6 rounded-xl border border-slate-200 shadow-sm border-l-4 ${border}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="size-4 text-slate-500" />
                <h3 className="font-semibold text-slate-900">{ins.title}</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{ins.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}