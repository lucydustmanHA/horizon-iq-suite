import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { $loadLiveCases, $getMetrics, $getMonitoring } from "../lib/live.server";
import { $getTodos } from "../lib/use-cases.server";
import type { LiveCaseSummary, LiveMetric } from "../lib/live-mock-data";

export const Route = createFileRoute("/live/report")({
  component: ReportPage,
  validateSearch: (search: Record<string, unknown>) => ({
    month: (search.month as string) || getCurrentMonth(),
  }),
});

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function formatMonth(ym: string) {
  const [y, m] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m) - 1]} ${y}`;
}

interface CaseDetail { case_: LiveCaseSummary; metrics: LiveMetric[]; monDesc: string; monCadence: string; monOwner: string; todos: {id: string; text: string; done: boolean; assignee: string}[]; }

function ReportPage() {
  const { month } = Route.useSearch();
  const [cases, setCases] = useState<LiveCaseSummary[]>([]);
  const [details, setDetails] = useState<CaseDetail[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    $loadLiveCases({ data: { reviewMonth: month } }).then(async (allCases) => {
      const c = allCases.filter((x) => !x.nonApplicable);
      setCases(c);
      const dets: CaseDetail[] = [];
      for (const cs of c) {
        const [metrics, mon, todos] = await Promise.all([
          $getMetrics({ data: { useCaseId: cs.id } }),
          $getMonitoring({ data: { useCaseId: cs.id } }),
          $getTodos({ data: { useCaseId: cs.id } }),
        ]);
        dets.push({ case_: cs, metrics, monDesc: mon?.description ?? "", monCadence: mon?.cadence ?? "", monOwner: mon?.monitoringOwner ?? "", todos: todos.filter((t: any) => !t.done) });
      }
      setDetails(dets);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [month]);

  const greenCount = cases.filter((c) => c.ragStatus === "green").length;
  const orangeCount = cases.filter((c) => c.ragStatus === "orange").length;
  const redCount = cases.filter((c) => c.ragStatus === "red").length;
  const proactiveCount = cases.filter((c) => c.proactivePct !== null && c.proactivePct > 0).length;
  const instrumentedCount = cases.filter((c) => c.proactivePct !== null).length;
  const pctProactive = instrumentedCount > 0 ? Math.round((proactiveCount / instrumentedCount) * 100) : 0;
  const openItems = details.reduce((s, d) => s + d.todos.length, 0);

  return (
    <div className="bg-white min-h-screen">
      {/* Print header bar */}
      <div className="print:hidden sticky top-0 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between z-10">
        <span className="text-sm text-slate-600 font-medium">Monthly Review Report · {formatMonth(month)}</span>
        <Button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white text-sm">Print / Save as PDF</Button>
      </div>

      {!loaded ? <p className="text-center py-20 text-slate-400">Loading report…</p> : (
        <div className="max-w-4xl mx-auto px-8 py-12 space-y-10 print:py-4">
          {/* Title */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Horizon QX · AI Portfolio</p>
            <h1 className="text-3xl font-bold mt-1">Monthly Review</h1>
            <p className="text-lg text-slate-500 mt-1">{formatMonth(month)} · Live & Delivering</p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard label="TOTAL LIVE" value={String(cases.length)} />
            <SummaryCard label="GREEN" value={String(greenCount)} color="text-emerald-600" />
            <SummaryCard label="AMBER" value={String(orangeCount)} color="text-amber-600" />
            <SummaryCard label="RED" value={String(redCount)} color="text-red-600" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SummaryCard label="% PROACTIVE MONITORING" value={`${pctProactive}%`} />
            <SummaryCard label="OPEN ACTION ITEMS" value={String(openItems)} />
          </div>

          {/* Portfolio at a glance */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-5 pt-4 pb-2">Portfolio at a Glance</p>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="px-5 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase">Use Case</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase">Workgroup</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase">Owner</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase">Stage</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase">RAG</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="px-5 py-3"><span className="font-semibold">{c.title}</span><br/><span className="text-xs text-slate-400">{c.id}</span></td>
                    <td className="px-3 py-3">{c.workgroup || "\u2014"}</td>
                    <td className="px-3 py-3">{c.owner || "\u2014"}</td>
                    <td className="px-3 py-3">Live</td>
                    <td className="px-3 py-3"><RagBadge status={c.ragStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-case details */}
          {details.map(({ case_: c, metrics, monDesc, monCadence, monOwner, todos }) => {
            const starredMetrics = metrics.filter((m) => m.starred);
            const allPeriods = Array.from(new Set(metrics.flatMap((m) => Object.keys(m.periodValues)))).sort().slice(-6);
            const approachLabel = c.proactivePct !== null && c.proactivePct > 0 ? "Proactive" : c.proactivePct === 0 ? "Reactive" : "";
            return (
              <div key={c.id} className="break-inside-avoid border-t border-slate-200 pt-8 space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-slate-400">{c.id} · {c.workgroup} · Live</p>
                    <h2 className="text-xl font-bold mt-1">{c.title}</h2>
                    <p className="text-sm text-slate-500 mt-1">{c.owner}{c.deployedDate ? ` \u00b7 Deployed ${new Date(c.deployedDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}` : ""}{approachLabel ? ` \u00b7 ${approachLabel} monitoring` : ""}</p>
                    {monOwner && <p className="text-xs text-slate-400 mt-0.5">Represented by: {monOwner}</p>}
                  </div>
                  <RagBadge status={c.ragStatus} />
                </div>

                {/* Monitoring process */}
                {monDesc && (
                  <div className="border border-slate-200 rounded-xl p-5">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Post-Deployment Monitoring Process</p>
                    <div className="text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: monDesc }} />
                    <p className="text-xs text-slate-400 mt-3">Cadence: {monCadence} · Owner: {monOwner}</p>
                  </div>
                )}

                {/* Starred KPIs */}
                {starredMetrics.length > 0 && (
                  <div className="flex gap-4">
                    {starredMetrics.map((m) => {
                      const vals = Object.values(m.periodValues);
                      const rv = vals.length > 0
                        ? m.rollup === "avg" ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
                        : m.rollup === "latest" ? String(vals[vals.length - 1])
                        : String(vals.reduce((a, b) => a + b, 0))
                        : "\u2014";
                      return (
                        <div key={m.id} className="border border-slate-200 rounded-xl p-4 min-w-[120px]">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">{m.metricName}</p>
                          <p className="text-2xl font-bold text-teal-600">{rv}{m.unit === "%" ? "%" : ""}</p>
                          {m.target !== null && <p className="text-xs text-slate-400">{m.rollup} · target ≥ {m.target}{m.unit === "%" ? "%" : ""}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Metrics table */}
                {metrics.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 pt-3 pb-1">All Tracked Metrics</p>
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-slate-400 uppercase">Metric</th>
                          {allPeriods.map((p) => <th key={p} className="px-2 py-2 text-center text-[10px] font-semibold text-slate-400 uppercase">{p}</th>)}
                          <th className="px-3 py-2 text-right text-[10px] font-semibold text-slate-400 uppercase">Roll-up</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.map((m) => {
                          const vals = Object.values(m.periodValues);
                          const rv = vals.length > 0
                            ? m.rollup === "avg" ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)
                            : m.rollup === "latest" ? String(vals[vals.length - 1])
                            : String(vals.reduce((a, b) => a + b, 0))
                            : "\u2014";
                          return (
                            <tr key={m.id} className="border-b border-slate-100">
                              <td className="px-4 py-2"><span className="font-medium">{m.metricName}</span><br/><span className="text-xs text-slate-400">{m.unit} · {m.direction === "down" ? "lower-better" : "higher-better"}</span></td>
                              {allPeriods.map((p) => <td key={p} className="px-2 py-2 text-center">{m.periodValues[p] ?? ""}</td>)}
                              <td className="px-3 py-2 text-right font-bold">{rv}{m.unit === "%" ? "%" : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Action items + health note */}
                {(todos.length > 0 || c.comment) && (
                  <div className="space-y-2">
                    {todos.length > 0 && (
                      <div className="border border-slate-200 rounded-xl p-4">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Open Action Items</p>
                        <ul className="space-y-1.5">
                          {todos.map((t: any) => (
                            <li key={t.id} className="flex items-start gap-2 text-sm text-slate-700">
                              <span className="text-slate-400 mt-0.5">•</span>
                              <span>{t.text}{t.assignee && <span className="text-slate-400 ml-1">({t.assignee})</span>}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {c.comment && <p className="text-sm"><span className="font-semibold">Health note:</span> <span className="text-slate-600">{c.comment}</span></p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-slate-200 rounded-xl p-5">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function RagBadge({ status }: { status: string }) {
  const cls = status === "green" ? "bg-emerald-100 text-emerald-700" : status === "orange" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  const label = status === "green" ? "Green" : status === "orange" ? "Amber" : "Red";
  return <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
}
