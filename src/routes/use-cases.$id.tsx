
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { usePortfolio } from "../lib/store";
import { WORKGROUPS, STAGES, STATUSES, BUSINESS_AREAS, STRATEGIC_FOCUSES, GROUPINGS, VENDORS, SOLUTION_TYPES, type Stage, type Status } from "../lib/types";
import { StageBadge, PriorityBadge, StatusBadge, OwnerAvatar } from "../components/badges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { ChevronLeft, Pencil, Check, X, Link2, Plus } from "lucide-react";

export const Route = createFileRoute("/use-cases/$id")({
  component: DetailPage,
  notFoundComponent: () => (
    <div className="p-16 text-center">
      <h1 className="text-xl font-semibold">Use case not found</h1>
      <Link to="/use-cases" className="text-accent-indigo text-sm mt-2 inline-block">Back to master list</Link>
    </div>
  ),
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtRel(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d < 1) return "today"; if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`; if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

/** Plain text inline edit */
function EditField({ label, value, onSave, multiline = false }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean; }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const save = () => { setEditing(false); if (draft.trim() !== value) onSave(draft.trim()); };
  return (
    <div className="flex justify-between items-start gap-4 text-sm group">
      <span className="text-slate-500 shrink-0 pt-0.5">{label}</span>
      {editing ? (
        multiline
          ? <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} rows={3} className="flex-1 text-slate-900 font-medium border-b border-accent-indigo outline-none bg-transparent resize-none text-right"
              value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
              onKeyDown={(e) => { if (e.key === "Escape") { setEditing(false); setDraft(value); } }} />
          : <input ref={ref as React.RefObject<HTMLInputElement>} className="flex-1 text-slate-900 font-medium text-right border-b border-accent-indigo outline-none bg-transparent"
              value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setDraft(value); } }} />
      ) : (
        <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-slate-900 font-medium text-right hover:text-accent-indigo transition-colors max-w-[60%]">
          <span className="break-words text-right">{value || <span className="text-slate-300 italic">—</span>}</span>
          <Pencil className="size-3 opacity-0 group-hover:opacity-40 shrink-0" />
        </button>
      )}
    </div>
  );
}

/** Dropdown + custom entry */
function ComboField({ label, value, options, onSave }: { label: string; value: string; options: readonly string[]; onSave: (v: string) => void; }) {
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState("");
  if (custom) return (
    <div className="flex justify-between items-center gap-4 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <input autoFocus className="flex-1 text-right border-b border-accent-indigo outline-none bg-transparent text-slate-900 font-medium"
        value={draft} placeholder="Type value…"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim()) onSave(draft.trim()); setCustom(false); setDraft(""); }}
        onKeyDown={(e) => { if (e.key === "Enter") { if (draft.trim()) onSave(draft.trim()); setCustom(false); setDraft(""); } if (e.key === "Escape") { setCustom(false); setDraft(""); } }} />
    </div>
  );
  return (
    <div className="flex justify-between items-center gap-4 text-sm group">
      <span className="text-slate-500 shrink-0">{label}</span>
      <Select value={value || "__none__"} onValueChange={(v) => { if (v === "__custom__") { setCustom(true); } else if (v !== "__none__") { onSave(v); } }}>
        <SelectTrigger className="w-auto h-auto border-0 shadow-none p-0 gap-1 text-slate-900 font-medium text-right justify-end focus:ring-0 hover:text-accent-indigo transition-colors">
          <SelectValue>{value || <span className="text-slate-400 italic font-normal">—</span>}</SelectValue>
          <Pencil className="size-3 opacity-0 group-hover:opacity-40 shrink-0" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          <SelectItem value="__custom__"><span className="text-accent-indigo font-medium">+ Add custom…</span></SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** Editable inline title */
function TitleEdit({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  const save = () => { setEditing(false); if (draft.trim() !== value) onSave(draft.trim()); };
  if (editing) return <textarea ref={ref} rows={2} className="text-2xl font-bold tracking-tight w-full border-b-2 border-accent-indigo outline-none bg-transparent resize-none"
    value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === "Escape") { setEditing(false); setDraft(value); } }} />;
  return <h1 className="text-2xl font-bold tracking-tight cursor-pointer hover:text-accent-indigo transition-colors group flex items-center gap-2" onClick={() => setEditing(true)} title="Click to edit">
    {value}<Pencil className="size-4 opacity-0 group-hover:opacity-40 shrink-0" /></h1>;
}

/** Editable description block */
function DescEdit({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const save = () => { setEditing(false); if (draft.trim() !== value) onSave(draft.trim()); };
  if (editing) return <div>
    <Textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save} rows={3} className="text-sm w-full" />
    <button onClick={save} className="mt-1 text-xs text-accent-indigo font-medium flex items-center gap-1"><Check className="size-3" /> Save</button>
  </div>;
  return <p className="text-sm text-slate-600 mt-2 max-w-3xl cursor-pointer hover:text-slate-900 transition-colors group flex items-start gap-1" onClick={() => setEditing(true)}>
    <span>{value || <span className="italic text-slate-400">Click to add description…</span>}</span>
    <Pencil className="size-3 mt-0.5 opacity-0 group-hover:opacity-40 shrink-0" />
  </p>;
}

function LinksList({ links, onUpdate }: { links: string[]; onUpdate: (links: string[]) => void }) {
  const [newLink, setNewLink] = useState("");
  const add = () => {
    const v = newLink.trim();
    if (!v) return;
    const withProtocol = v.startsWith("http") ? v : `https://${v}`;
    onUpdate([...links, withProtocol]);
    setNewLink("");
  };
  return (
    <div className="space-y-3">
      {links.map((l, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <Link2 className="size-4 text-slate-400 shrink-0" />
          <a href={l} target="_blank" rel="noreferrer" className="text-accent-indigo hover:underline flex-1 truncate">{l}</a>
          <button onClick={() => onUpdate(links.filter((_, j) => j !== i))} className="text-slate-400 hover:text-status-danger transition-colors"><X className="size-3" /></button>
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <Input value={newLink} onChange={(e) => setNewLink(e.target.value)} placeholder="https://…"
          className="h-8 text-sm flex-1"
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="sm" variant="outline" onClick={add} className="gap-1 h-8 px-3"><Plus className="size-3" /> Add</Button>
      </div>
    </div>
  );
}

function DetailPage() {
  const { id } = Route.useParams();
  const useCase = usePortfolio((s) => s.useCases.find((u) => u.id === id));
  const updateUseCase = usePortfolio((s) => s.updateUseCase);
  const addComment = usePortfolio((s) => s.addComment);
  const [comment, setComment] = useState("");

  if (!useCase) throw notFound();
  const save = (patch: Parameters<typeof updateUseCase>[1]) => updateUseCase(useCase.id, patch);

  const priorityLabel = useCase.priority === 1 ? "2026" : useCase.priority === 2 ? "2027+" : "—";

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <Link to="/use-cases" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
        <ChevronLeft className="size-4" /> All use cases
      </Link>

      {/* Header */}
      <header className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-slate-400 mb-1">{useCase.id}</p>
            <TitleEdit value={useCase.title} onSave={(v) => save({ title: v })} />
            <DescEdit value={useCase.description} onSave={(v) => save({ description: v })} />
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StageBadge stage={useCase.stage} />
            <StatusBadge status={useCase.status} />
          </div>
        </div>
        {/* Editable header facets */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Workgroup</p>
            <Select value={useCase.workgroup} onValueChange={(v) => save({ workgroup: v })}>
              <SelectTrigger className="h-auto border-0 shadow-none p-0 font-medium text-slate-900 hover:text-accent-indigo focus:ring-0 w-auto text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{WORKGROUPS.map((wg) => <SelectItem key={wg} value={wg}>{wg}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Priority</p>
            <Select value={String(useCase.priority ?? "")} onValueChange={(v) => save({ priority: Number(v) as 1 | 2 })}>
              <SelectTrigger className="h-auto border-0 shadow-none p-0 font-medium text-slate-900 hover:text-accent-indigo focus:ring-0 w-auto text-sm">
                <SelectValue>{priorityLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">2026</SelectItem>
                <SelectItem value="2">2027+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Owner</p>
            <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-900"><OwnerAvatar name={useCase.useCaseOwner} size={20} /> {useCase.useCaseOwner || "—"}</span>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
            <Select value={useCase.status} onValueChange={(v) => save({ status: v as Status })}>
              <SelectTrigger className="h-auto border-0 shadow-none p-0 font-medium text-slate-900 hover:text-accent-indigo focus:ring-0 w-auto text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="links">Links ({useCase.links.length})</TabsTrigger>
          <TabsTrigger value="comments">Comments ({useCase.comments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel title="Organization">
              <ComboField label="Business Area" value={useCase.businessArea} options={BUSINESS_AREAS} onSave={(v) => save({ businessArea: v })} />
              <ComboField label="Strategic Focus" value={useCase.strategicGoal} options={STRATEGIC_FOCUSES} onSave={(v) => save({ strategicGoal: v })} />
              <ComboField label="Workgroup" value={useCase.workgroup} options={WORKGROUPS} onSave={(v) => save({ workgroup: v })} />
              <ComboField label="Grouping" value={useCase.grouping} options={GROUPINGS} onSave={(v) => save({ grouping: v })} />
            </Panel>
            <Panel title="Ownership">
              <EditField label="Business Owner" value={useCase.businessOwner} onSave={(v) => save({ businessOwner: v })} />
              <EditField label="Use Case Owner" value={useCase.useCaseOwner} onSave={(v) => save({ useCaseOwner: v })} />
              <ComboField label="Vendor" value={useCase.developer} options={VENDORS} onSave={(v) => save({ developer: v })} />
            </Panel>
            <Panel title="Classification">
              <ComboField label="Solution Type" value={useCase.solutionType} options={SOLUTION_TYPES} onSave={(v) => save({ solutionType: v })} />
              <EditField label="Data Source" value={useCase.dataSource} onSave={(v) => save({ dataSource: v })} />
            </Panel>
          </div>

          <Panel title="Quick Edit">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Stage</p>
                <Select value={useCase.stage} onValueChange={(v) => save({ stage: v as Stage })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Status</p>
                <Select value={useCase.status} onValueChange={(v) => save({ status: v as Status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Priority</p>
                <Select value={String(useCase.priority ?? "")} onValueChange={(v) => save({ priority: Number(v) as 1 | 2 })}>
                  <SelectTrigger><SelectValue>{priorityLabel}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">2026</SelectItem>
                    <SelectItem value="2">2027+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="activity">
          <Panel title="Activity Timeline">
            <ol className="relative border-l border-slate-200 ml-2 space-y-6 pt-2">
              {[...useCase.activity].reverse().map((a) => (
                <li key={a.id} className="pl-6 relative">
                  <span className="absolute -left-[7px] top-1 size-3 rounded-full bg-white border-2 border-accent-indigo" />
                  <p className="text-xs text-slate-400 font-medium">{fmtDate(a.date)} · {fmtRel(a.date)}</p>
                  <p className="text-sm text-slate-900 mt-0.5">{a.message}</p>
                  {a.actor && <p className="text-[11px] text-slate-500">by {a.actor}</p>}
                </li>
              ))}
            </ol>
          </Panel>
        </TabsContent>

        <TabsContent value="metrics">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Time Saved / Month" value={`${useCase.timeSavedPerMonth} hrs`} />
            <MetricCard label="Annual Time Saved" value={`${useCase.annualTimeSaved.toLocaleString()} hrs`} />
            <MetricCard label="Cost Savings" value={`$${useCase.costSavings.toLocaleString()}`} />
            <MetricCard label="Effort Reduction" value={`${useCase.effortBefore} → ${useCase.effortAfter}`} sub={`Δ ${useCase.effortBefore - useCase.effortAfter}`} />
          </div>
          <div className="mt-4">
            <Panel title="Proactive vs Reactive">
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="bg-status-success h-full" style={{ width: `${useCase.proactivePct}%` }} />
                <div className="bg-status-warning h-full" style={{ width: `${useCase.reactivePct}%` }} />
              </div>
              <div className="flex justify-between text-xs mt-2 text-slate-600">
                <span>Proactive {useCase.proactivePct}%</span><span>Reactive {useCase.reactivePct}%</span>
              </div>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="links">
          <Panel title="Links & References">
            <LinksList links={useCase.links} onUpdate={(links) => save({ links })} />
          </Panel>
        </TabsContent>

        <TabsContent value="comments">
          <Panel title="Discussion">
            <div className="space-y-4">
              {useCase.comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <OwnerAvatar name={c.author} size={28} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{c.author}</span>
                      <span className="text-xs text-slate-400">{fmtRel(c.date)}</span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1">{c.body}</p>
                  </div>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-4">
                <Textarea placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" className="bg-accent-indigo hover:bg-accent-indigo/90 text-white"
                    onClick={() => { if (!comment.trim()) return; addComment(useCase.id, comment.trim()); setComment(""); }}>
                    Post comment
                  </Button>
                </div>
              </div>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm"><h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3><div className="space-y-3">{children}</div></div>;
}
function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
    <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
    {sub && <p className="text-xs text-status-success mt-1 font-medium">{sub}</p>}
  </div>;
}
