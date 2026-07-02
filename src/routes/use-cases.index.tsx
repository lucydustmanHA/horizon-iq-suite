
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { usePortfolio, useFilteredUseCases } from "../lib/store";
import { STAGES } from "../lib/types";
import { StageBadge, PriorityBadge, FlagBadge, OwnerAvatar, flagRowClass } from "../components/badges";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Download, Filter, X } from "lucide-react";

export const Route = createFileRoute("/use-cases/")({
  validateSearch: (s: Record<string,unknown>) => ({
    q: typeof s.q === "string" ? s.q : "",
    status: typeof s.status === "string" ? s.status : "",
  }),
  component: UseCasesPage,
});

function UseCasesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/use-cases/" });
  const globalFiltered = useFilteredUseCases();
  const settings = usePortfolio((s) => s.settings);
  const workgroups = settings["workgroup"] ?? ["Back Office","SOC","Flt Ops","Inflight","M&E","Safety","Stations"];

  const [q, setQ] = useState(search.q ?? "");
  const [wg, setWg] = useState("all");
  const [stage, setStage] = useState("all");
  const [statusFilter, setStatusFilter] = useState(search.status ?? "all");
  const [sortKey, setSortKey] = useState<"priority"|"title"|"stage"|"savings">("priority");

  // Sync URL search param q into local state
  useEffect(() => { if (search.q) setQ(search.q); }, [search.q]);
  useEffect(() => { if (search.status) setStatusFilter(search.status); }, [search.status]);

  const activeFilters: {label:string; clear:()=>void}[] = [];
  if (q) activeFilters.push({ label: `"${q}"`, clear: () => { setQ(""); navigate({ search: (s) => ({ ...s, q: "" }) }); } });
  if (wg !== "all") activeFilters.push({ label: `Workgroup: ${wg}`, clear: () => setWg("all") });
  if (stage !== "all") activeFilters.push({ label: `Stage: ${stage}`, clear: () => setStage("all") });
  if (statusFilter !== "all") activeFilters.push({ label: `Flag: ${statusFilter}`, clear: () => setStatusFilter("all") });

  const rows = useMemo(() => {
    let r = globalFiltered.filter((u) => {
      if (wg !== "all" && u.workgroup !== wg) return false;
      if (stage !== "all" && u.stage !== stage) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (q) {
        const s = q.toLowerCase();
        return u.title.toLowerCase().includes(s) || u.id.toLowerCase().includes(s) ||
          u.description.toLowerCase().includes(s) || (u.tags as string[] ?? []).some((t) => t.toLowerCase().includes(s));
      }
      return true;
    });
    const cmp = {
      priority: (a: typeof r[0], b: typeof r[0]) => (a.priority ?? 99) - (b.priority ?? 99),
      title:    (a: typeof r[0], b: typeof r[0]) => a.title.localeCompare(b.title),
      stage:    (a: typeof r[0], b: typeof r[0]) => a.stage.localeCompare(b.stage),
      savings:  (a: typeof r[0], b: typeof r[0]) => b.costSavings - a.costSavings,
    };
    return r.sort(cmp[sortKey]);
  }, [globalFiltered, q, wg, stage, statusFilter, sortKey]);

  function exportCSV() {
    const headers = ["id","title","workgroup","stage","flag","priority","owner","annualHoursSaved","costSavings"];
    const lines = [headers.join(",")];
    for (const u of rows) lines.push([u.id,JSON.stringify(u.title),u.workgroup,u.stage,u.status,u.priority,JSON.stringify(u.useCaseOwner),u.annualTimeSaved,u.costSavings].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "use-cases.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Master Use Case Database</h1>
          <p className="text-sm text-slate-500 mt-1">{rows.length} of {globalFiltered.length} use cases</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5"><Download className="size-4" /> Export</Button>
      </header>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-500"><Filter className="size-4" /><span className="text-xs font-semibold uppercase tracking-wider">Filters</span></div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, ID, description…" className="w-64" />
          <Select value={wg} onValueChange={setWg}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Workgroup" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All workgroups</SelectItem>{workgroups.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Stage" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All stages</SelectItem>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Flag" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All flags</SelectItem><SelectItem value="Blocked">Blocked</SelectItem><SelectItem value="Action Needed">Action Needed</SelectItem></SelectContent>
          </Select>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as typeof sortKey)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent><SelectItem value="priority">Priority ↑</SelectItem><SelectItem value="savings">Savings ↓</SelectItem><SelectItem value="title">Title A→Z</SelectItem><SelectItem value="stage">Stage A→Z</SelectItem></SelectContent>
          </Select>
        </div>
        {/* Active filter pills */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {activeFilters.map((f) => (
              <span key={f.label} className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent-indigo/10 text-accent-indigo text-xs font-medium rounded-full">
                {f.label}
                <button onClick={f.clear} className="ml-0.5 hover:text-accent-indigo/60"><X className="size-3" /></button>
              </span>
            ))}
            <button onClick={() => { setQ(""); setWg("all"); setStage("all"); setStatusFilter("all"); }} className="text-xs text-slate-400 hover:text-slate-600 underline ml-1">Clear all</button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-3">ID</th><th className="px-4 py-3">Use Case</th><th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Flags</th><th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Workgroup</th><th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3 text-right">Annual Hrs</th><th className="px-4 py-3 text-right">Cost Savings</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={u.id} className={"transition-colors " + flagRowClass(u.status)}>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{u.id}</td>
                  <td className="px-4 py-3"><Link to="/use-cases/$id" params={{ id: u.id }} className="font-medium text-sm text-slate-900 hover:text-accent-indigo">{u.title}</Link><p className="text-xs text-slate-500 line-clamp-1">{u.description}</p></td>
                  <td className="px-4 py-3"><StageBadge stage={u.stage} /></td>
                  <td className="px-4 py-3"><FlagBadge status={u.status} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={u.priority} /></td>
                  <td className="px-4 py-3 text-xs text-slate-600">{u.workgroup}</td>
                  <td className="px-4 py-3"><OwnerAvatar name={u.useCaseOwner} /></td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-700">{u.annualTimeSaved.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-700">${u.costSavings.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
