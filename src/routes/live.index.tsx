import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Download, ChevronRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { $loadLiveCases, $getReviewMonths, $toggleNonApplicable } from "../lib/live.server";
import type { LiveCaseSummary } from "../lib/live-mock-data";
import { OwnerAvatar } from "../components/badges";

export const Route = createFileRoute("/live/")({
  component: LiveDashboard,
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

function formatCurrency(n: number) {
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
}

function LiveDashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<LiveCaseSummary[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    $getReviewMonths().then((m) => {
      const current = getCurrentMonth();
      const allMonths = m.includes(current) ? m : [current, ...m];
      setMonths(allMonths);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    setLoaded(false);
    const fetchWithRetry = (attempt = 0) => {
      $loadLiveCases({ data: { reviewMonth: selectedMonth } })
        .then((c) => { setCases(c); setLoaded(true); })
        .catch((err) => {
          console.error(`[Live] load attempt ${attempt + 1} failed:`, err);
          if (attempt < 2) setTimeout(() => fetchWithRetry(attempt + 1), 1500);
          else setLoaded(true);
        });
    };
    fetchWithRetry();
  }, [selectedMonth]);

  const activeCases = cases.filter((c) => !c.nonApplicable);
  const nonApplicableCases = cases.filter((c) => c.nonApplicable);
  const [naExpanded, setNaExpanded] = useState(false);

  const handleToggleNA = async (ucId: string, val: boolean) => {
    setCases((prev) => prev.map((c) => c.id === ucId ? { ...c, nonApplicable: val } : c));
    await $toggleNonApplicable({ data: { useCaseId: ucId, nonApplicable: val } });
  };

  const grouped = useMemo(() => {
    const green = activeCases.filter((c) => c.ragStatus === "green");
    const orange = activeCases.filter((c) => c.ragStatus === "orange");
    const red = activeCases.filter((c) => c.ragStatus === "red");
    const unset = activeCases.filter((c) => !c.ragStatus || !["green","orange","red"].includes(c.ragStatus));
    return { green, orange, red, unset };
  }, [activeCases]);

  const totalLive = activeCases.length;
  const openTodos = activeCases.reduce((sum, c) => sum + c.openTodos, 0);
  const proactiveCount = activeCases.filter((c) => c.proactivePct !== null && c.proactivePct > 0).length;
  const instrumentedCount = activeCases.filter((c) => c.proactivePct !== null).length;

  
  function exportCSV() {
    const headers = ["id","title","workgroup","owner","rag","openTodos","approach"];
    const lines = [headers.join(",")];
    for (const c of cases) lines.push([c.id,JSON.stringify(c.title),c.workgroup,JSON.stringify(c.owner),c.rag??"green",c.openTodos??0,c.approach??""].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "live-delivering-export.csv"; a.click();
    URL.revokeObjectURL(url);
  }

return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Live & Delivering</h1>
          <span className="text-slate-300">·</span>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-auto border-0 shadow-none p-0 gap-1 text-sm font-medium text-slate-600 focus:ring-0 w-auto">
              <SelectValue>{formatMonth(selectedMonth)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs uppercase tracking-wide font-semibold text-teal-700 whitespace-nowrap">Monthly Review</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button variant="outline" className="gap-1.5" onClick={() => navigate({ to: "/live/report", search: { month: selectedMonth } })}><Download className="size-4" /> Export Report</Button>
          <Button className="bg-teal-700 hover:bg-teal-800 text-white" onClick={() => navigate({ to: "/live/review", search: { month: selectedMonth } })}>
            Start Review
          </Button>
        </div>
      </div>

      <p className="text-sm text-slate-500 -mt-4">Reviewing post-deployment monitoring, accuracy, and the custom KPIs each use case tracks.</p>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="TOTAL LIVE" value={String(totalLive)} sub="use cases in production" />
        <MetricCard label="GREEN / AMBER / RED" value={`${grouped.green.length} / ${grouped.orange.length} / ${grouped.red.length}`} sub="current RAG breakdown" />
        <MetricCard label="OPEN TO-DOS" value={String(openTodos)} sub="across all live cases" highlight={openTodos > 0} />
        <MetricCard label="% PROACTIVE" value={instrumentedCount > 0 ? `${Math.round((proactiveCount / instrumentedCount) * 100)}%` : "—"} sub={`${proactiveCount} of ${instrumentedCount} instrumented`} />
      </div>

      {!loaded && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <svg className="animate-spin size-8 text-accent-indigo" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-slate-400 text-sm">Loading live cases…</p>
        </div>
      )}

      {loaded && cases.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <p className="text-slate-500 font-medium">No live use cases yet</p>
          <p className="text-slate-400 text-sm mt-1">Move a use case to the “Completed” stage to see it here</p>
        </div>
      )}

      {grouped.green.length > 0 && <RagSection color="green" label="On track" count={grouped.green.length} hoursSaved={grouped.green.reduce((s, c) => s + c.hoursSaved, 0)} cases={grouped.green} onToggleNA={handleToggleNA} />}
      {grouped.orange.length > 0 && <RagSection color="orange" label="Watch" count={grouped.orange.length} hoursSaved={grouped.orange.reduce((s, c) => s + c.hoursSaved, 0)} cases={grouped.orange} onToggleNA={handleToggleNA} />}
      {grouped.red.length > 0 && <RagSection color="red" label="Action needed" count={grouped.red.length} hoursSaved={grouped.red.reduce((s, c) => s + c.hoursSaved, 0)} cases={grouped.red} onToggleNA={handleToggleNA} />}
      {grouped.unset.length > 0 && <RagSection color="gray" label="Not reviewed" count={grouped.unset.length} hoursSaved={grouped.unset.reduce((s, c) => s + c.hoursSaved, 0)} cases={grouped.unset} onToggleNA={handleToggleNA} />}

      {/* Non-Applicable / One-and-Done */}
      {nonApplicableCases.length > 0 && (
        <div className="border-t border-slate-200 pt-4 mt-6">
          <button onClick={() => setNaExpanded(!naExpanded)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronRight className={`size-4 transition-transform ${naExpanded ? "rotate-90" : ""}`} />
            <span className="font-medium">Non-Applicable / One-and-Done</span>
            <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">{nonApplicableCases.length}</span>
          </button>
          {naExpanded && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {nonApplicableCases.map((c) => <LiveCaseCard key={c.id} case_={c} onToggleNA={handleToggleNA} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? "text-amber-600" : "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function RagSection({ color, label, count, hoursSaved, cases, onToggleNA }: { color: string; label: string; count: number; hoursSaved: number; cases: LiveCaseSummary[]; onToggleNA?: (id: string, val: boolean) => void }) {
  const styles: Record<string, { bg: string; text: string; dot: string }> = {
    green:  { bg: "bg-emerald-50 border-l-4 border-l-emerald-500", text: "text-emerald-700", dot: "bg-emerald-500" },
    orange: { bg: "bg-amber-50 border-l-4 border-l-amber-500",     text: "text-amber-700",   dot: "bg-amber-500" },
    red:    { bg: "bg-red-50 border-l-4 border-l-red-500",         text: "text-red-700",     dot: "bg-red-500" },
    gray:   { bg: "bg-slate-50 border-l-4 border-l-slate-400",     text: "text-slate-600",   dot: "bg-slate-400" },
  };
  const s = styles[color] || styles.gray;

  return (
    <div className="space-y-3">
      <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${s.bg}`}>
        <div className="flex items-center gap-2">
          <span className={`size-2.5 rounded-full ${s.dot}`} />
          <span className={`font-semibold ${s.text}`}>{label}</span>
          <span className="text-slate-500 font-medium ml-1">{count}</span>
        </div>
        {hoursSaved > 0 && <span className="text-sm text-slate-500">{hoursSaved.toLocaleString()} hrs saved</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cases.map((c) => <LiveCaseCard key={c.id} case_={c} onToggleNA={onToggleNA} />)}
      </div>
    </div>
  );
}

function LiveCaseCard({ case_: c, onToggleNA }: { case_: LiveCaseSummary; onToggleNA?: (id: string, val: boolean) => void }) {
  const approachLabel = c.proactivePct !== null && c.proactivePct > 0 ? "Proactive" : c.proactivePct !== null && c.proactivePct === 0 ? "Reactive" : null;
  const approachColor = approachLabel === "Proactive"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : approachLabel === "Reactive"
    ? "bg-amber-50 text-amber-700 border-amber-200" : "";

  return (
    <Link to="/live/$id" params={{ id: c.id }} className="block bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs text-slate-400 font-mono">{c.id}</span>
        {approachLabel && <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${approachColor}`}>{approachLabel}</span>}
      </div>
      <h3 className="font-semibold text-slate-900 text-sm leading-tight mb-3">{c.title}</h3>
      {c.owner && (
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
          <OwnerAvatar name={c.owner} size={20} />
          <span>{c.owner}</span>
        </div>
      )}
      {c.starredMetrics.length > 0 && (
        <div className="flex gap-4 mb-3">
          {c.starredMetrics.slice(0, 2).map((m) => {
            const vals = Object.values(m.periodValues);
            const rollupVal = vals.length > 0
              ? m.rollup === "latest" ? vals[vals.length - 1]
              : m.rollup === "sum" ? vals.reduce((a, b) => a + b, 0)
              : vals.reduce((a, b) => a + b, 0) / vals.length
              : null;
            return (
              <div key={m.id} className="flex-1">
                <p className="text-[10px] text-slate-500 uppercase font-medium truncate">{m.metricName}</p>
                <p className="text-lg font-bold text-teal-600">{rollupVal !== null ? `${rollupVal.toFixed(1)}${m.unit === "%" ? "%" : ""}` : "—"}</p>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
        <span>{c.hoursSaved > 0 ? `${c.hoursSaved.toLocaleString()} hrs saved` : ""}</span>
        {c.openTodos > 0 && <span className="text-amber-600 font-medium">{c.openTodos} open to-do{c.openTodos > 1 ? "s" : ""}</span>}
      </div>
      {onToggleNA && (
        <div className="mt-2 pt-2 border-t border-slate-50">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 hover:text-slate-600 transition-colors" onClick={(e) => e.preventDefault()}>
            <input type="checkbox" checked={c.nonApplicable} onChange={(e) => { e.stopPropagation(); onToggleNA(c.id, e.target.checked); }}
              className="size-3 rounded border-slate-300 text-slate-400 focus:ring-slate-200 cursor-pointer" />
            <span>Not actively monitored</span>
          </label>
        </div>
      )}
    </Link>
  );
}
