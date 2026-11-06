import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ClipboardList, ChevronDown, Pencil, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useStrategyUI, useStrategyOptions, strategyKeys } from "../lib/strategy-hooks";
import { ACTION_STATUSES, isClosedAction, matchesSearch, fmtDate, type StrategyActionItem, type StrategyDeepDive } from "../lib/strategy-types";
import { $listDeepDives, $saveDeepDive, $deleteDeepDive, $listActionItems, $saveActionItem, $deleteActionItem } from "../lib/strategy.server";
import { PageHeader, Card, EmptyState, LoadError } from "../components/strategy/ui";

export const Route = createFileRoute("/strategy/deep-dives")({
  validateSearch: (s: Record<string, unknown>): { id?: number } => (s.id ? { id: Number(s.id) } : {}),
  head: () => ({ meta: [{ title: "Deep Dives — Strategy — Horizon QX" }] }),
  component: DeepDivesPage,
});

const STATUS_PILL: Record<string, string> = {
  "Not started": "bg-slate-100 text-slate-600 ring-slate-200",
  "In progress": "bg-sky-50 text-sky-700 ring-sky-200",
  Blocked: "bg-red-50 text-red-700 ring-red-200",
  Done: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Dropped: "bg-zinc-100 text-zinc-500 ring-zinc-200",
};
const errMsg = (e: unknown) => String((e as Error)?.message ?? e);

function DeepDivesPage() {
  const { id: selectedId } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { year, search } = useStrategyUI();
  const { data: dives = [], isLoading, error } = useQuery({ queryKey: strategyKeys.deepDives(year), queryFn: () => $listDeepDives({ data: { year } }) });
  const current = dives.find((d) => d.id === selectedId) ?? dives[0] ?? null;
  const [sessionDlg, setSessionDlg] = useState<StrategyDeepDive | "new" | null>(null);

  const select = (id: number) => navigate({ to: "/strategy/deep-dives" as any, search: { id } as any, replace: true });
  const refreshDives = () => qc.invalidateQueries({ queryKey: strategyKeys.deepDives(year) });

  if (error) return <div className="p-8"><LoadError error={error} /></div>;

  return (
    <div className="p-8 space-y-5">
      <PageHeader title="Deep Dives" subtitle={`Action items captured in leadership deep-dive sessions · FY${year}`}
        actions={<Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5" onClick={() => setSessionDlg("new")}><Plus className="size-4" />New deep dive</Button>} />
      {!isLoading && dives.length === 0 ? (
        <Card><EmptyState icon={<ClipboardList className="size-5" />} title={`No deep dives for FY${year}`}
          body="Create a session (for example, “Summer B Deep Dive”) and capture its action items by area."
          action={<Button variant="outline" className="gap-1.5" onClick={() => setSessionDlg("new")}><Plus className="size-4" />New deep dive</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="space-y-2">
            {dives.map((d) => {
              const pct = d.itemCount ? Math.round(((d.itemCount - d.openCount) / d.itemCount) * 100) : 0;
              const active = current?.id === d.id;
              return (
                <button key={d.id} onClick={() => select(d.id)}
                  className={`w-full text-left rounded-xl border p-3 bg-white transition-all ${active ? "border-accent-indigo ring-2 ring-accent-indigo/20 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}>
                  <p className="text-sm font-semibold text-slate-900 truncate">{d.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{fmtDate(d.heldOn)} · {d.openCount} open / {d.itemCount}</p>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                </button>
              );
            })}
          </div>
          <div className="lg:col-span-3">
            {current && <SessionItems key={current.id} session={current} search={search} onEdit={() => setSessionDlg(current)} onChanged={refreshDives} />}
          </div>
        </div>
      )}
      <SessionDialog value={sessionDlg} year={year} onClose={() => setSessionDlg(null)}
        onSaved={async (id) => { await refreshDives(); if (id) select(id); }} />
    </div>
  );
}

function SessionItems({ session, search, onEdit, onChanged }: { session: StrategyDeepDive; search: string; onEdit: () => void; onChanged: () => Promise<unknown> }) {
  const qc = useQueryClient();
  const { areas: areaOptions } = useStrategyOptions();
  const key = strategyKeys.actions(session.id);
  const { data: items = [], isLoading } = useQuery({ queryKey: key, queryFn: () => $listActionItems({ data: { deepDiveId: session.id } }) });
  const [filter, setFilter] = useState<"all" | "open" | "closed">("open");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<StrategyActionItem | null>(null);

  const refresh = async () => { await qc.invalidateQueries({ queryKey: key }); await onChanged(); };
  const save = async (item: Omit<StrategyActionItem, "id"> & { id?: number }) => {
    // optimistic for quick status changes
    if (item.id) qc.setQueryData<StrategyActionItem[]>(key, (prev) => prev?.map((p) => (p.id === item.id ? { ...p, ...item } as StrategyActionItem : p)));
    try { await $saveActionItem({ data: item }); await refresh(); }
    catch (e) { toast.error("Could not save action item", { description: errMsg(e) }); await refresh(); }
  };

  const shown = items.filter((i) => (filter === "all" ? true : filter === "open" ? !isClosedAction(i.status) : isClosedAction(i.status)) && matchesSearch(search, i.action, i.owner, i.notes, i.area));
  const areas = useMemo(() => Array.from(new Set([...areaOptions, ...items.map((i) => i.area)])).filter(Boolean), [areaOptions, items]);
  const del = async () => {
    if (!confirm(`Delete "${session.name}" and all ${session.itemCount} action items?`)) return;
    try { await $deleteDeepDive({ data: { id: session.id } }); await onChanged(); } catch (e) { toast.error("Could not delete", { description: errMsg(e) }); }
  };

  return (
    <Card bodyClassName=""
      title={<span>{session.name}<span className="font-normal text-slate-400 ml-2">{fmtDate(session.heldOn)}</span></span>}
      actions={
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
            {([["open", "Open"], ["closed", "Done"], ["all", "All"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`px-2.5 py-1 rounded-md font-medium ${filter === k ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}>
                {l} <span className="opacity-60">{k === "all" ? items.length : items.filter((i) => (k === "open" ? !isClosedAction(i.status) : isClosedAction(i.status))).length}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Edit deep dive"><Pencil className="size-3.5" /></Button>
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-status-danger" onClick={del} aria-label="Delete deep dive"><Trash2 className="size-3.5" /></Button>
        </div>
      }>
      {isLoading ? <p className="text-xs text-slate-400 p-4">Loading…</p> : (
        <div className="divide-y divide-slate-100">
          {areas.map((area) => {
            const rows = shown.filter((i) => i.area === area);
            const total = items.filter((i) => i.area === area);
            const open = total.filter((i) => !isClosedAction(i.status)).length;
            const isCollapsed = collapsed[area];
            return (
              <div key={area}>
                <button onClick={() => setCollapsed({ ...collapsed, [area]: !isCollapsed })} className="w-full flex items-center gap-2 px-4 py-2 bg-slate-50/70 hover:bg-slate-50 text-left">
                  <ChevronDown className={`size-3.5 text-slate-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{area}</span>
                  <span className="text-[11px] text-slate-400">{open} open · {total.length} total</span>
                </button>
                {!isCollapsed && (
                  <>
                    {rows.length > 0 && (
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {rows.map((i) => {
                            const closed = isClosedAction(i.status);
                            return (
                              <tr key={i.id} className="group hover:bg-slate-50/60">
                                <td className="pl-4 pr-1 py-2 w-8 align-top">
                                  <button onClick={() => save({ ...i, status: closed ? "In progress" : "Done" })} aria-label={closed ? "Reopen" : "Mark done"}
                                    className={`mt-0.5 size-4 rounded border flex items-center justify-center ${closed ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 hover:border-accent-indigo"}`}>
                                    {closed && <Check className="size-3" />}
                                  </button>
                                </td>
                                <td className="px-2 py-2 align-top cursor-pointer" onClick={() => setEditing(i)}>
                                  <p className={closed ? "text-slate-400 line-through" : "text-slate-800"}>{i.action}</p>
                                  {i.notes && <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{i.notes}</p>}
                                </td>
                                <td className="px-2 py-2 align-top text-xs text-slate-600 w-40">{i.owner || <span className="text-slate-300">Unassigned</span>}</td>
                                <td className="px-2 py-2 align-top text-xs text-slate-500 w-36">{i.timing || "—"}</td>
                                <td className="px-2 py-2 align-top w-36">
                                  <Select value={i.status} onValueChange={(v) => save({ ...i, status: v })}>
                                    <SelectTrigger className={`h-7 text-xs ring-1 ring-inset border-0 ${STATUS_PILL[i.status] ?? ""}`}><SelectValue /></SelectTrigger>
                                    <SelectContent>{ACTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                  </Select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    <QuickAdd onAdd={(action) => save({ deepDiveId: session.id, area, action, owner: "", timing: "", status: "Not started", notes: "" })} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <ActionDialog item={editing} areas={areas} onClose={() => setEditing(null)} onSave={async (it) => { await save(it); setEditing(null); }}
        onDelete={async (it) => { try { await $deleteActionItem({ data: { id: it.id } }); await refresh(); setEditing(null); } catch (e) { toast.error("Could not delete", { description: errMsg(e) }); } }} />
    </Card>
  );
}

function QuickAdd({ onAdd }: { onAdd: (action: string) => Promise<void> }) {
  const [v, setV] = useState("");
  const submit = async () => { const t = v.trim(); if (!t) return; setV(""); await onAdd(t); };
  return (
    <div className="flex items-center gap-2 pl-12 pr-4 py-1.5">
      <Plus className="size-3.5 text-slate-300" />
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Add action item and press Enter…" className="flex-1 bg-transparent text-sm placeholder:text-slate-300 focus:outline-none py-1" />
    </div>
  );
}

function ActionDialog({ item, areas, onClose, onSave, onDelete }: {
  item: StrategyActionItem | null; areas: string[]; onClose: () => void; onSave: (i: StrategyActionItem) => Promise<void>; onDelete: (i: StrategyActionItem) => Promise<void>;
}) {
  const [f, setF] = useState<StrategyActionItem | null>(item);
  useEffect(() => setF(item), [item]);
  if (!f) return null;
  const set = <K extends keyof StrategyActionItem>(k: K, v: StrategyActionItem[K]) => setF({ ...f, [k]: v });
  const label = (t: string) => <label className="text-xs font-medium text-slate-500 mb-1 block">{t}</label>;
  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Action item</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div>{label("Action")}<Textarea rows={2} value={f.action} onChange={(e) => set("action", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>{label("Area")}
              <Select value={f.area} onValueChange={(v) => set("area", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>{label("Status")}
              <Select value={f.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{ACTION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>{label("Owner")}<Input value={f.owner} onChange={(e) => set("owner", e.target.value)} /></div>
            <div>{label("Timing")}<Input value={f.timing} onChange={(e) => set("timing", e.target.value)} placeholder="e.g. Before the holidays" /></div>
          </div>
          <div>{label("Notes")}<Textarea rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" className="text-slate-400 hover:text-status-danger gap-1.5" onClick={() => onDelete(f)}><Trash2 className="size-4" />Delete</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white" onClick={() => onSave(f)} disabled={!f.action.trim()}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionDialog({ value, year, onClose, onSaved }: { value: StrategyDeepDive | "new" | null; year: number; onClose: () => void; onSaved: (id?: number) => Promise<void> }) {
  const [name, setName] = useState("");
  const [heldOn, setHeldOn] = useState("");
  useEffect(() => {
    if (value === "new") { setName(""); setHeldOn(new Date().toISOString().slice(0, 10)); }
    else if (value) { setName(value.name); setHeldOn(value.heldOn ?? ""); }
  }, [value]);
  const save = async () => {
    if (!name.trim() || !value) return;
    try {
      const { id } = await $saveDeepDive({ data: { id: value === "new" ? undefined : value.id, year, name: name.trim(), heldOn: heldOn || null } });
      await onSaved(id); onClose();
    } catch (e) { toast.error("Could not save deep dive", { description: errMsg(e) }); }
  };
  return (
    <Dialog open={!!value} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{value === "new" ? "New deep dive" : "Edit deep dive"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div><label className="text-xs font-medium text-slate-500 mb-1 block">Name</label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. Summer B ${year} Deep Dive`} autoFocus /></div>
          <div><label className="text-xs font-medium text-slate-500 mb-1 block">Held on</label><Input type="date" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white" onClick={save} disabled={!name.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
