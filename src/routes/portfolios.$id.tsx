import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, ArrowUp, ArrowDown, ArrowUpDown, Plus, X, Check } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { usePortfolio } from "../lib/store";
import { StageBadge, PriorityBadge } from "../components/badges";
import {
  $getPortfolio,
  $addUseCasesToPortfolio,
  $removeUseCasesFromPortfolio,
  type PortfolioDetail,
} from "../lib/portfolios.server";

function SortHeader({ label, field, sortKey, sortDir, onSort, className }: { label: string; field: string; sortKey: string; sortDir: string; onSort: (f: string)=>void; className?: string }) {
  const active = sortKey === field;
  return (
    <th className={`px-4 py-3 cursor-pointer select-none hover:text-slate-600 transition-colors text-left ${className ?? ""}`} onClick={() => onSort(field)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-30" />}
      </span>
    </th>
  );
}

export const Route = createFileRoute("/portfolios/$id")({
  component: PortfolioDetailPage,
});

function PortfolioDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const allUseCases = usePortfolio((s) => s.useCases);

  const [sortKey, setSortKey] = useState<string>("title");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [portfolio, setPortfolio] = useState<PortfolioDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = () => {
    $getPortfolio({ data: { id } })
      .then((p) => { setPortfolio(p); setLoading(false); })
      .catch((err) => { console.error(err); setLoading(false); });
  };

  useEffect(() => { load(); }, [id]);

  const onSort = (f: string) => { if (sortKey === f) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortKey(f); setSortDir("asc"); } };

  const memberUseCases = useMemo(
    () => allUseCases.filter((uc) => portfolio?.useCaseIds.includes(uc.id)),
    [allUseCases, portfolio?.useCaseIds]
  );

  const nonMemberUseCases = useMemo(() => {
    const memberIds = new Set(portfolio?.useCaseIds ?? []);
    return allUseCases.filter((uc) => !memberIds.has(uc.id));
  }, [allUseCases, portfolio?.useCaseIds]);

  const filteredNonMembers = useMemo(() => {
    if (!search.trim()) return nonMemberUseCases;
    const q = search.toLowerCase();
    return nonMemberUseCases.filter(
      (uc) => uc.title.toLowerCase().includes(q) || uc.workgroup.toLowerCase().includes(q)
    );
  }, [nonMemberUseCases, search]);

  const handleAddUseCases = async () => {
    if (!selected.size) return;
    setSaving(true);
    try {
      await $addUseCasesToPortfolio({ data: { portfolioId: id, useCaseIds: [...selected] } });
      setSelected(new Set());
      setAddDialogOpen(false);
      load();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (ucId: string) => {
    await $removeUseCasesFromPortfolio({ data: { portfolioId: id, useCaseIds: [ucId] } });
    load();
  };

  const toggleSelect = (ucId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ucId)) next.delete(ucId); else next.add(ucId);
      return next;
    });
  };

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!portfolio) return <div className="p-8 text-sm text-red-500">Portfolio not found.</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/portfolios" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="size-5" />
        </Link>
        <div
          className="size-3 rounded-full shrink-0"
          style={{ backgroundColor: portfolio.color }}
        />
        <h1 className="text-xl font-bold tracking-tight">{portfolio.name}</h1>
        <span className="text-xs text-muted-foreground ml-2">
          {portfolio.useCaseCount} use case{portfolio.useCaseCount !== 1 ? "s" : ""}
        </span>
      </div>
      {portfolio.description && (
        <p className="text-sm text-muted-foreground mb-6 max-w-2xl">{portfolio.description}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => { setSearch(""); setSelected(new Set()); setAddDialogOpen(true); }}
        >
          <Plus className="size-3.5" />
          Add Use Cases
        </Button>
      </div>

      {/* Table */}
      {memberUseCases.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <p className="text-sm text-muted-foreground">No use cases in this portfolio yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Click "Add Use Cases" to get started.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <SortHeader label="Title" field="title" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Stage" field="stage" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Priority" field="priority" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Workgroup" field="workgroup" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortHeader label="Owner" field="owner" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...memberUseCases].sort((a, b) => { const cmp: Record<string, (a: any, b: any) => number> = { title: (a,b) => a.title.localeCompare(b.title), stage: (a,b) => a.stage.localeCompare(b.stage), priority: (a,b) => (a.priority??99) - (b.priority??99), workgroup: (a,b) => (a.workgroup??"").localeCompare(b.workgroup??""), owner: (a,b) => (a.useCaseOwner??"").localeCompare(b.useCaseOwner??"") }; const r = (cmp[sortKey] ?? cmp.title)(a,b); return sortDir === "desc" ? -r : r; }).map((uc) => (
                <tr key={uc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to="/use-cases/$id"
                      params={{ id: uc.id }}
                      className="font-medium text-slate-800 hover:text-accent-indigo transition-colors"
                    >
                      {uc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><StageBadge stage={uc.stage} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={uc.priority} /></td>
                  <td className="px-4 py-3 text-slate-600">{uc.workgroup || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{uc.useCaseOwner || "—"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRemove(uc.id)}
                      className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                      title="Remove from portfolio"
                    >
                      <X className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Use Cases Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Use Cases to {portfolio.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Search use cases…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto border rounded-md max-h-[40vh]">
            {filteredNonMembers.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                {nonMemberUseCases.length === 0
                  ? "All use cases are already in this portfolio."
                  : "No matching use cases."}
              </div>
            ) : (
              <div className="divide-y">
                {filteredNonMembers.slice(0, 50).map((uc) => (
                  <button
                    key={uc.id}
                    onClick={() => toggleSelect(uc.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${
                      selected.has(uc.id) ? "bg-indigo-50" : ""
                    }`}
                  >
                    <div
                      className={`size-4 rounded border flex items-center justify-center shrink-0 ${
                        selected.has(uc.id)
                          ? "bg-accent-indigo border-accent-indigo"
                          : "border-slate-300"
                      }`}
                    >
                      {selected.has(uc.id) && <Check className="size-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{uc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {uc.workgroup || "No workgroup"} · {uc.stage}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="bg-accent-indigo hover:bg-accent-indigo/90 text-white"
              onClick={handleAddUseCases}
              disabled={saving || !selected.size}
            >
              {saving ? "Adding…" : `Add ${selected.size || ""} use case${selected.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
