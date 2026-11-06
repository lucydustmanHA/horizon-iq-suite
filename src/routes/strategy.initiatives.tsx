import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useStrategyUI, useStrategyYearData, useStrategyOptions, useRefreshStrategy } from "../lib/strategy-hooks";
import { INITIATIVE_STATUSES, matchesSearch, fmtDate, type StrategyInitiative } from "../lib/strategy-types";
import { $saveInitiative, $deleteInitiative } from "../lib/strategy.server";
import { PageHeader, Card, EmptyState, LoadError } from "../components/strategy/ui";

export const Route = createFileRoute("/strategy/initiatives")({
  head: () => ({ meta: [{ title: "Initiatives — Strategy — Horizon QX" }] }),
  component: InitiativesPage,
});

const STATUS_PILL: Record<string, string> = {
  Planned: "bg-slate-100 text-slate-600 ring-slate-200",
  Active: "bg-teal-50 text-teal-700 ring-teal-200",
  "At risk": "bg-amber-50 text-amber-700 ring-amber-200",
  Complete: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

function InitiativesPage() {
  const { year, search } = useStrategyUI();
  const { data, isLoading, error } = useStrategyYearData();
  const refresh = useRefreshStrategy();
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<StrategyInitiative | null | "new">(null);

  const all = useMemo(() => (data?.initiatives ?? []).filter((i) => matchesSearch(search, i.name, i.objective, i.owner, i.department)), [data, search]);
  const rows = all.filter((i) => status === "all" || i.status === status);
  const today = new Date().toISOString().slice(0, 10);

  const quickStatus = async (i: StrategyInitiative, s: string) => {
    try { await $saveInitiative({ data: { ...i, status: s } }); await refresh(); }
    catch (e) { toast.error("Could not update initiative", { description: String((e as Error)?.message ?? e) }); }
  };

  if (error) return <div className="p-8"><LoadError error={error} /></div>;

  return (
    <div className="p-8 space-y-5">
      <PageHeader title="Initiatives" subtitle={`Cross-department business initiatives for FY${year}`}
        actions={<Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5" onClick={() => setEditing("new")}><Plus className="size-4" />New initiative</Button>} />
      {all.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {["all", ...INITIATIVE_STATUSES].map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
              {s === "all" ? `All (${all.length})` : `${s} (${all.filter((i) => i.status === s).length})`}
            </button>
          ))}
        </div>
      )}
      <Card bodyClassName="overflow-x-auto">
        {!isLoading && all.length === 0 ? (
          <EmptyState icon={<Rocket className="size-5" />} title={`No initiatives for FY${year}`} body="Track the larger programs of work that support your strategic goals."
            action={<Button variant="outline" className="gap-1.5" onClick={() => setEditing("new")}><Plus className="size-4" />New initiative</Button>} />
        ) : (
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left w-[28%]">Initiative</th>
                <th className="px-3 py-2 text-left">Department</th>
                <th className="px-3 py-2 text-left">Owner</th>
                <th className="px-3 py-2 text-left">Target date</th>
                <th className="px-3 py-2 text-left w-36">Status</th>
                <th className="px-3 py-2 text-left w-[28%]">Latest update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((i) => {
                const overdue = i.targetDate && i.targetDate < today && i.status !== "Complete";
                return (
                  <tr key={i.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setEditing(i)}>
                    <td className="px-4 py-2.5"><p className="font-semibold text-slate-900">{i.name}</p>{i.objective && <p className="text-xs text-slate-500 line-clamp-1">{i.objective}</p>}</td>
                    <td className="px-3 py-2.5 text-slate-700">{i.department || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-700">{i.owner || "—"}</td>
                    <td className={`px-3 py-2.5 whitespace-nowrap ${overdue ? "text-red-600 font-medium" : "text-slate-700"}`}>{fmtDate(i.targetDate)}</td>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Select value={i.status} onValueChange={(v) => quickStatus(i, v)}>
                        <SelectTrigger className={`h-7 text-xs ring-1 ring-inset border-0 ${STATUS_PILL[i.status] ?? ""}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{INITIATIVE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600"><span className="line-clamp-2">{i.progressNotes || <span className="text-slate-300">No update yet</span>}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <InitiativeDialog value={editing} year={year} onClose={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}

function InitiativeDialog({ value, year, onClose, onSaved }: { value: StrategyInitiative | null | "new"; year: number; onClose: () => void; onSaved: () => Promise<unknown> }) {
  const { departments } = useStrategyOptions();
  const blank: StrategyInitiative = { id: 0, year, name: "", objective: "", department: "", owner: "", targetDate: null, status: "Planned", progressNotes: "" };
  const [f, setF] = useState<StrategyInitiative>(blank);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (value) setF(value === "new" ? blank : value); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const isNew = value === "new";
  const set = <K extends keyof StrategyInitiative>(k: K, v: StrategyInitiative[K]) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return;
    setSaving(true);
    try { await $saveInitiative({ data: { ...f, id: isNew ? undefined : f.id } }); await onSaved(); onClose(); }
    catch (e) { toast.error("Could not save initiative", { description: String((e as Error)?.message ?? e) }); }
    finally { setSaving(false); }
  };
  const del = async () => {
    if (!confirm(`Delete "${f.name}"?`)) return;
    try { await $deleteInitiative({ data: { id: f.id } }); await onSaved(); onClose(); }
    catch (e) { toast.error("Could not delete initiative", { description: String((e as Error)?.message ?? e) }); }
  };
  const label = (t: string) => <label className="text-xs font-medium text-slate-500 mb-1 block">{t}</label>;
  return (
    <Dialog open={!!value} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{isNew ? "New initiative" : "Edit initiative"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div>{label("Name *")}<Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus /></div>
          <div>{label("Objective")}<Input value={f.objective} onChange={(e) => set("objective", e.target.value)} placeholder="What it should achieve" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>{label("Department")}
              <Select value={f.department || "__none__"} onValueChange={(v) => set("department", v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">Cross-department</SelectItem>{departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>{label("Owner")}<Input value={f.owner} onChange={(e) => set("owner", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>{label("Target date")}<Input type="date" value={f.targetDate ?? ""} onChange={(e) => set("targetDate", e.target.value || null)} /></div>
            <div>{label("Status")}
              <Select value={f.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{INITIATIVE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>{label("Latest update")}<Textarea rows={3} value={f.progressNotes} onChange={(e) => set("progressNotes", e.target.value)} /></div>
        </div>
        <DialogFooter className="sm:justify-between">
          {!isNew ? <Button variant="ghost" className="text-slate-400 hover:text-status-danger gap-1.5" onClick={del}><Trash2 className="size-4" />Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white" onClick={save} disabled={saving || !f.name.trim()}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
