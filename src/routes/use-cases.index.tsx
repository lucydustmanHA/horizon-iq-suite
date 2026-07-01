import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { usePortfolio } from "../lib/store";
import { STAGES, WORKGROUPS } from "../lib/types";
import { StageBadge, PriorityBadge, StatusBadge, OwnerAvatar, RiskDot } from "../components/badges";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Download, Filter } from "lucide-react";

export const Route = createFileRoute("/use-cases/")({
  head: () => ({
    meta: [
      { title: "Use Cases — Horizon QX" },
      { name: "description", content: "Master database of every AI and automation use case in the portfolio." },
    ],
  }),
  component: UseCasesPage,
});

function UseCasesPage() {
  const useCases = usePortfolio((s) => s.useCases);
  const [q, setQ] = useState("");
  const [wg, setWg] = useState<string>("all");
  const [stage, setStage] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"priority" | "title" | "stage" | "risk" | "savings">("priority");

  const rows = useMemo(() => {
    let r = useCases.filter((u) => {
      if (wg !== "all" && u.workgroup !== wg) return false;
      if (stage !== "all" && u.stage !== stage) return false;
      if (q) {
        const s = q.toLowerCase();
        return (
          u.title.toLowerCase().includes(s) ||
          u.id.toLowerCase().includes(s) ||
          u.description.toLowerCase().includes(s) ||
          u.tags.some((t) => t.toLowerCase().includes(s))
        );
      }
      return true;
    });
    const cmp: Record<typeof sortKey, (a: (typeof r)[number], b: (typeof r)[number]) => number> = {
      priority: (a, b) => b.priority - a.priority,
      title: (a, b) => a.title.localeCompare(b.title),
      stage: (a, b) => a.stage.localeCompare(b.stage),
      risk: (a, b) => b.risk - a.risk,
      savings: (a, b) => b.costSavings - a.costSavings,
    };
    return r.sort(cmp[sortKey]);
  }, [useCases, q, wg, stage, sortKey]);

  function exportCSV() {
    const headers = [
      "id",
      "title",
      "workgroup",
      "stage",
      "status",
      "priority",
      "risk",
      "owner",
      "annualHoursSaved",
      "costSavings",
    ];
    const lines = [headers.join(",")];
    for (const u of rows) {
      lines.push(
        [
          u.id,
          JSON.stringify(u.title),
          u.workgroup,
          u.stage,
          u.status,
          u.priority,
          u.risk,
          JSON.stringify(u.useCaseOwner),
          u.annualTimeSaved,
          u.costSavings,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "horizon-qx-use-cases.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Master Use Case Database</h1>
          <p className="text-sm text-slate-500 mt-1">
            {rows.length} of {useCases.length} use cases
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
            <Download className="size-4" /> Export
          </Button>
        </div>
      </header>

      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-slate-500">
          <Filter className="size-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Filters</span>
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, ID, tag..."
          className="w-64"
        />
        <Select value={wg} onValueChange={setWg}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Workgroup" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workgroups</SelectItem>
            {WORKGROUPS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Stage" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as typeof sortKey)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">Priority ↓</SelectItem>
            <SelectItem value="risk">Risk ↓</SelectItem>
            <SelectItem value="savings">Savings ↓</SelectItem>
            <SelectItem value="title">Title A→Z</SelectItem>
            <SelectItem value="stage">Stage A→Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Use Case</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Workgroup</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3 text-right">Annual Hrs</th>
                <th className="px-4 py-3 text-right">Cost Savings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{u.id}</td>
                  <td className="px-4 py-3">
                    <Link
                      to="/use-cases/$id"
                      params={{ id: u.id }}
                      className="font-medium text-sm text-slate-900 hover:text-accent-indigo"
                    >
                      {u.title}
                    </Link>
                    <p className="text-xs text-slate-500 line-clamp-1">{u.description}</p>
                  </td>
                  <td className="px-4 py-3"><StageBadge stage={u.stage} /></td>
                  <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={u.priority} /></td>
                  <td className="px-4 py-3"><RiskDot risk={u.risk} /></td>
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