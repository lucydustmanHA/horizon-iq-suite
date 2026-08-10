import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { ChevronLeft, Pencil, Check, X, Link2, Plus, CheckSquare, Square, Trash2, Paperclip, Star, Save } from "lucide-react";
import { NotesEditor } from "../components/notes-editor";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { OwnerAvatar, StageBadge, FlagBadge } from "../components/badges";
import { usePortfolio } from "../lib/store";
import { STAGES, STATUSES, WORKGROUPS, BUSINESS_AREAS, STRATEGIC_FOCUSES, GROUPINGS, VENDORS, SOLUTION_TYPES, TIME_UNITS, type Stage, type Status, type TodoItem, type Effort } from "../lib/types";
import type { LiveMetric, LiveMonitoring } from "../lib/live-mock-data";
import { METRIC_UNITS, ROLLUP_OPTIONS, CADENCE_OPTIONS } from "../lib/live-mock-data";
import { $getTodos, $addTodo, $updateTodo, $deleteTodo, $saveNotes } from "../lib/use-cases.server";
import { $getMonitoring, $upsertMonitoring, $getMetrics, $addMetric, $updateMetric, $deleteMetric, $toggleNonApplicable } from "../lib/live.server";
import { $upsertSettingOption } from "../lib/settings.server";

const ANNUAL_MULTIPLIER: Record<string, number> = { day: 260, week: 52, month: 12, quarter: 4, year: 1, once: 1 };
function calcAnnual(value: number, unit: string) { return Math.round(value * (ANNUAL_MULTIPLIER[unit] ?? 12)); }

const fmtRel = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000); if (d < 1) return "today"; if (d === 1) return "yesterday"; if (d < 30) return `${d}d ago`; if (d < 365) return `${Math.floor(d/30)}mo ago`; return `${Math.floor(d/365)}y ago`; };

export const Route = createFileRoute("/live/$id")({
  component: LiveDetailPage,
  notFoundComponent: () => <div className="p-16 text-center"><h1 className="text-xl font-semibold">Use case not found</h1><Link to="/live" className="text-accent-indigo text-sm mt-2 inline-block">Back to Live & Delivering</Link></div>,
});

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Helper components (same patterns as use-cases detail page)
function EditableMetricCard({ label, value, onSave, prefix="", suffix="", desc }: { label:string; value:number; onSave:(v:number)=>void; prefix?:string; suffix?:string; desc?:string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(()=>{ setDraft(String(value)); },[value]);
  useEffect(()=>{ if(editing)ref.current?.select(); },[editing]);
  const commit = ()=>{ setEditing(false); const n=parseFloat(draft.replace(/[^0-9.]/g,"")); if(!isNaN(n)&&n!==value)onSave(n); };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm cursor-pointer group" onClick={()=>!editing&&setEditing(true)}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      {editing ? <input ref={ref} autoFocus value={draft} onChange={(e)=>setDraft(e.target.value)} onBlur={commit} onKeyDown={(e)=>{ if(e.key==="Enter")commit(); if(e.key==="Escape"){setEditing(false);setDraft(String(value));} }} className="text-2xl font-bold text-accent-indigo w-full border-b-2 border-accent-indigo outline-none bg-transparent" />
        : <p className="text-2xl font-bold text-slate-900 group-hover:text-accent-indigo transition-colors">{prefix}{value.toLocaleString()}{suffix}</p>}
      {desc && <p className="text-[10px] text-slate-400 mt-1 leading-snug">{desc}</p>}
      {!editing && <p className="text-[10px] text-slate-300 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">click to edit</p>}
    </div>
  );
}

function EditField({ label, value, onSave, multiline=false }: { label:string; value:string; onSave:(v:string)=>void; multiline?:boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const save = () => { setEditing(false); if (draft.trim() !== value) onSave(draft.trim()); };
  return (
    <div className="flex justify-between items-start gap-4 text-sm group">
      <span className="text-slate-500 shrink-0 pt-0.5">{label}</span>
      {editing
        ? multiline
          ? <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} rows={3} className="flex-1 text-slate-900 font-medium border-b border-accent-indigo outline-none bg-transparent resize-none text-right" value={draft} onChange={(e)=>setDraft(e.target.value)} onBlur={save} onKeyDown={(e)=>{ if(e.key==="Escape"){setEditing(false);setDraft(value);} }} />
          : <input ref={ref as React.RefObject<HTMLInputElement>} className="flex-1 text-slate-900 font-medium text-right border-b border-accent-indigo outline-none bg-transparent" value={draft} onChange={(e)=>setDraft(e.target.value)} onBlur={save} onKeyDown={(e)=>{ if(e.key==="Enter")save(); if(e.key==="Escape"){setEditing(false);setDraft(value);} }} />
        : <button onClick={()=>setEditing(true)} className="flex items-center gap-1 text-slate-900 font-medium text-right hover:text-accent-indigo transition-colors max-w-[60%]"><span className="break-words text-right">{value||<span className="text-slate-300 italic">—</span>}</span><Pencil className="size-3 opacity-0 group-hover:opacity-40 shrink-0" /></button>
      }
    </div>
  );
}

function ComboField({ label, options, value, onSave }: { label:string; options:readonly string[]|string[]; value:string; onSave:(v:string)=>void }) {
  const { settings, addSettingOption } = usePortfolio();
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState("");
  const effectiveOptions = settings[label.toLowerCase().replace(/ /g,"_")] ?? options;
  if (custom) return (
    <div className="flex justify-between items-center gap-4 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <input autoFocus className="flex-1 text-right border-b border-accent-indigo outline-none bg-transparent text-slate-900 font-medium" value={draft} placeholder="Type value…"
        onChange={(e)=>setDraft(e.target.value)}
        onBlur={()=>{ if(draft.trim()){ const k=label.toLowerCase().replace(/ /g,"_"); addSettingOption(k,draft.trim()); $upsertSettingOption({data:{key:k,value:draft.trim()}}).catch(console.error); onSave(draft.trim()); } setCustom(false); setDraft(""); }}
        onKeyDown={(e)=>{ if(e.key==="Enter"&&draft.trim()){ const k=label.toLowerCase().replace(/ /g,"_"); addSettingOption(k,draft.trim()); $upsertSettingOption({data:{key:k,value:draft.trim()}}).catch(console.error); onSave(draft.trim()); setCustom(false); setDraft(""); } if(e.key==="Escape"){setCustom(false);setDraft("");} }} />
    </div>
  );
  return (
    <div className="flex justify-between items-center gap-4 text-sm group">
      <span className="text-slate-500 shrink-0">{label}</span>
      <Select value={value||"__none__"} onValueChange={(v)=>{ if(v==="__custom__")setCustom(true); else if(v!=="__none__")onSave(v); }}>
        <SelectTrigger className="w-auto h-auto border-0 shadow-none p-0 gap-1 text-slate-900 font-medium text-right justify-end focus:ring-0 hover:text-accent-indigo transition-colors">
          <SelectValue>{value||<span className="text-slate-400 italic font-normal">—</span>}</SelectValue>
          <Pencil className="size-3 opacity-0 group-hover:opacity-40 shrink-0" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {effectiveOptions.map((o)=><SelectItem key={o} value={o}>{o}</SelectItem>)}
          <SelectItem value="__custom__"><span className="text-accent-indigo font-medium">+ Add custom…</span></SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}



function TodoRow({ todo, onToggle, onDelete, onUpdateText, onUpdateAssignee }: { todo:TodoItem; onToggle:()=>void; onDelete:()=>void; onUpdateText:(v:string)=>void; onUpdateAssignee:(v:string)=>void }) {
  const [editText, setEditText] = useState(false);
  const [editAssignee, setEditAssignee] = useState(false);
  const [tDraft, setTDraft] = useState(todo.text);
  const [aDraft, setADraft] = useState(todo.assignee);
  useEffect(()=>{ setTDraft(todo.text); setADraft(todo.assignee); },[todo.text,todo.assignee]);
  return (
    <li className="flex items-start gap-2 group rounded-lg p-2 hover:bg-slate-50 transition-colors">
      <button onClick={onToggle} className="mt-0.5 shrink-0 text-slate-400 hover:text-accent-indigo transition-colors">{todo.done?<CheckSquare className="size-4 text-status-success"/>:<Square className="size-4"/>}</button>
      <div className="flex-1 min-w-0">
        {editText
          ? <input autoFocus value={tDraft} onChange={(e)=>setTDraft(e.target.value)} className="text-sm w-full border-b border-accent-indigo outline-none bg-transparent" onBlur={()=>{ setEditText(false); if(tDraft.trim()!==todo.text)onUpdateText(tDraft.trim()); }} onKeyDown={(e)=>{ if(e.key==="Enter"){setEditText(false);if(tDraft.trim()!==todo.text)onUpdateText(tDraft.trim());} if(e.key==="Escape"){setEditText(false);setTDraft(todo.text);} }} />
          : <p className={`text-sm cursor-pointer ${todo.done?"line-through text-slate-400":"text-slate-900"}`} onClick={()=>setEditText(true)}>{todo.text||<span className="italic text-slate-300">untitled</span>}</p>
        }
        {editAssignee
          ? <input autoFocus value={aDraft} onChange={(e)=>setADraft(e.target.value)} placeholder="Assigned to…" className="text-xs w-full border-b border-accent-indigo outline-none bg-transparent text-slate-500 mt-0.5" onBlur={()=>{ setEditAssignee(false); if(aDraft!==todo.assignee)onUpdateAssignee(aDraft); }} onKeyDown={(e)=>{ if(e.key==="Enter"){setEditAssignee(false);if(aDraft!==todo.assignee)onUpdateAssignee(aDraft);} if(e.key==="Escape"){setEditAssignee(false);setADraft(todo.assignee);} }} />
          : <p className="text-xs text-slate-400 mt-0.5 cursor-pointer hover:text-accent-indigo" onClick={()=>setEditAssignee(true)}>{todo.assignee?`→ ${todo.assignee}`:<span className="italic opacity-50">unassigned</span>}</p>
        }
      </div>
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-status-danger transition-all mt-0.5 shrink-0"><Trash2 className="size-3.5"/></button>
    </li>
  );
}

function FilesAndLinks({ links, onUpdate }: { links:string[]; onUpdate:(links:string[])=>void }) {
  const [newLink, setNewLink] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const parseLink = (l: string): { type: "url" | "file"; name: string; href: string } => {
    try { const obj = JSON.parse(l); if (obj.type === "file") return { type: "file", name: obj.name, href: obj.data }; } catch {}
    return { type: "url", name: l, href: l.startsWith("http") ? l : `https://${l}` };
  };
  const add = () => { const v = newLink.trim(); if (!v) return; onUpdate([...links, v.startsWith("http") ? v : `https://${v}`]); setNewLink(""); };
  const attachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) { alert("File must be under 5 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      onUpdate([...links, JSON.stringify({ type: "file", name: file.name, data: reader.result as string })]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return (
    <div className="space-y-3">
      {links.map((l, i) => {
        const { type, name, href } = parseLink(l);
        return (
          <div key={i} className="flex items-center gap-2 text-sm">
            {type === "file" ? <Paperclip className="size-4 text-slate-400 shrink-0" /> : <Link2 className="size-4 text-slate-400 shrink-0" />}
            <a href={href} download={type === "file" ? name : undefined} target={type === "url" ? "_blank" : undefined} rel="noreferrer" className="text-accent-indigo hover:underline flex-1 truncate">{name}</a>
            <button onClick={() => onUpdate(links.filter((_, j) => j !== i))} className="text-slate-400 hover:text-status-danger"><X className="size-3" /></button>
          </div>
        );
      })}
      <div className="flex gap-2 pt-2 flex-wrap">
        <Input value={newLink} onChange={(e) => setNewLink(e.target.value)} placeholder="Paste a URL" className="h-8 text-sm flex-1 min-w-40" onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="sm" variant="outline" onClick={add} className="gap-1 h-8 px-3"><Plus className="size-3" /> Add URL</Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1 h-8 px-3 text-slate-600"><Paperclip className="size-3" /> Attach file</Button>
        <input ref={fileRef} type="file" className="hidden" onChange={attachFile} />
      </div>
    </div>
  );
}

// ============================================================================
// Main Component - Full detail page with Post-Deployment tab
// ============================================================================
function LiveDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const useCase = usePortfolio((s) => s.useCases.find((u) => u.id === id));
  const updateUseCase = usePortfolio((s) => s.updateUseCase);
  const addComment = usePortfolio((s) => s.addComment);
  const deleteComment = usePortfolio((s) => s.deleteComment);
  const deleteActivity = usePortfolio((s) => s.deleteActivity);
  const pageSettings = usePortfolio((s) => s.settings);
  const [comment, setComment] = useState("");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todosLoaded, setTodosLoaded] = useState(false);
  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoAssignee, setNewTodoAssignee] = useState("");

  // Live/monitoring state
  const [monitoring, setMonitoring] = useState<LiveMonitoring | null>(null);
  const [metrics, setMetrics] = useState<LiveMetric[]>([]);
  const [monDesc, setMonDesc] = useState("");
  const [monCadence, setMonCadence] = useState("Weekly");
  const [monOwner, setMonOwner] = useState("");
  const [monSaving, setMonSaving] = useState(false);

  // Notes
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    $getTodos({ data: { useCaseId: id } }).then((t) => { setTodos(t); setTodosLoaded(true); });
    // Load live data
    Promise.all([
      $getMonitoring({ data: { useCaseId: id } }),
      $getMetrics({ data: { useCaseId: id } }),
    ]).then(([mon, met]) => {
      setMonitoring(mon);
      setMetrics(met);
      setMonDesc(mon?.description ?? "");
      setMonCadence(mon?.cadence ?? "Weekly");
      setMonOwner(mon?.monitoringOwner ?? "");
    }).catch(console.error);
  }, [id]);

  useEffect(() => {
    if (useCase) setNotes(useCase.notes || "");
  }, [useCase?.notes]);

  if (!useCase) return (
    <div className="p-16 text-center">
      <h1 className="text-xl font-semibold">Use case not found</h1>
      <Link to="/live" className="text-accent-indigo text-sm mt-2 inline-block">Back to Live & Delivering</Link>
    </div>
  );

  const save = (patch: Parameters<typeof updateUseCase>[1]) => updateUseCase(useCase.id, patch);
  const isDeploymentPlus = ["Deployment","Completed"].includes(useCase.stage);
  const annualCalc = calcAnnual(useCase.timeSavedValue ?? 0, useCase.timeSavedUnit ?? "month");
  const priorityLabel = useCase.priority === 1 ? "2026" : useCase.priority === 2 ? "2027+" : "—";

  const autoSaveNotes = (html: string) => {
    setNotes(html);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(async () => {
      setNotesSaving(true);
      await $saveNotes({ data: { id, notes: html } });
      updateUseCase(id, { notes: html });
      setNotesSaving(false);
    }, 1500);
  };

  const handleAddTodo = async () => {
    const text = newTodoText.trim();
    if (!text) return;
    const t = await $addTodo({ data: { useCaseId: id, text, assignee: newTodoAssignee.trim() } });
    setTodos((prev) => [...prev, t]);
    if (!useCase.status || (useCase.status !== "Blocked" && useCase.status !== "Action Needed")) {
      save({ status: "Action Needed" });
    }
    setNewTodoText(""); setNewTodoAssignee("");
  };
  const handleToggle = async (t: TodoItem) => {
    const nowDone = !t.done;
    const updated = todos.map((x) => x.id === t.id ? { ...x, done: nowDone } : x);
    setTodos(updated);
    if (nowDone && updated.every((x) => x.done) && useCase.status === "Action Needed") save({ status: "" });
    await $updateTodo({ data: { id: t.id, done: nowDone } });
  };
  const handleDeleteTodo = async (todoId: string) => {
    const remaining = todos.filter((x) => x.id !== todoId);
    setTodos(remaining);
    if (remaining.every((x) => x.done) && useCase.status === "Action Needed") save({ status: "" });
    await $deleteTodo({ data: { id: todoId } });
  };

  const saveMonitoring = async () => {
    setMonSaving(true);
    const result = await $upsertMonitoring({
      data: { useCaseId: id, description: monDesc, tools: [], cadence: monCadence, monitoringOwner: monOwner, approach: monitoring?.approach ?? "" }
    });
    setMonitoring(result);
    setMonSaving(false);
    toast.success("Monitoring process saved");
  };

  const openTodoCount = todos.filter(t => !t.done).length;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <Link to="/live" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"><ChevronLeft className="size-4" /> Live & Delivering</Link>

      {/* Header */}
      <header className={`border rounded-xl p-6 shadow-sm ${useCase.status === "Blocked" ? "bg-red-50/30 border-red-200" : useCase.status === "Action Needed" ? "bg-amber-50/30 border-amber-200" : "bg-white border-slate-200"}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-slate-400 mb-1">{useCase.id}</p>
            <h1 className="text-2xl font-bold tracking-tight">{useCase.title}</h1>
            {useCase.description && <p className="text-sm text-slate-600 mt-2 max-w-3xl">{useCase.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StageBadge stage={useCase.stage} />
            <FlagBadge status={useCase.status} />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          {[
            { lbl:"Stage", render: () => <Select value={useCase.stage} onValueChange={(v)=>save({stage:v as Stage})}><SelectTrigger className="h-auto border-0 shadow-none p-0 font-medium text-slate-900 hover:text-accent-indigo focus:ring-0 w-auto text-sm"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map((s)=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select> },
            { lbl:"Workgroup", render: () => <Select value={useCase.workgroup} onValueChange={(v)=>save({workgroup:v})}><SelectTrigger className="h-auto border-0 shadow-none p-0 font-medium text-slate-900 hover:text-accent-indigo focus:ring-0 w-auto text-sm"><SelectValue /></SelectTrigger><SelectContent>{(pageSettings["workgroup"]?.length ? pageSettings["workgroup"] : WORKGROUPS).map((wg)=><SelectItem key={wg} value={wg}>{wg}</SelectItem>)}</SelectContent></Select> },
            { lbl:"Priority", render: () => <Select value={String(useCase.priority??"")} onValueChange={(v)=>save({priority:Number(v) as 1|2})}><SelectTrigger className="h-auto border-0 shadow-none p-0 font-medium text-slate-900 hover:text-accent-indigo focus:ring-0 w-auto text-sm"><SelectValue>{priorityLabel}</SelectValue></SelectTrigger><SelectContent><SelectItem value="1">2026</SelectItem><SelectItem value="2">2027+</SelectItem></SelectContent></Select> },
            { lbl:"Flag", render: () => <Select value={useCase.status||"__none__"} onValueChange={(v)=>save({status:v==="__none__"?"":v as Status})}><SelectTrigger className="h-auto border-0 shadow-none p-0 font-medium text-slate-900 hover:text-accent-indigo focus:ring-0 w-auto text-sm"><SelectValue>{useCase.status||<span className="text-slate-400 italic font-normal text-sm">None</span>}</SelectValue></SelectTrigger><SelectContent><SelectItem value="__none__">None</SelectItem>{STATUSES.map((s)=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select> },
            { lbl:"Owner", render: () => <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-900"><OwnerAvatar name={useCase.useCaseOwner} size={20} />{useCase.useCaseOwner||"—"}</span> },
          ].map(({lbl, render}) => (
            <div key={lbl}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{lbl}</p>
              {render()}
            </div>
          ))}
        </div>
      </header>

      {/* Starred KPI cards */}
      {(() => {
        const starred = metrics.filter((m) => m.starred);
        if (starred.length === 0) return null;
        return (
          <div className="flex gap-4 flex-wrap">
            {starred.map((m) => {
              const vals = Object.values(m.periodValues);
              const rv = vals.length > 0
                ? m.rollup === "avg" ? vals.reduce((a, b) => a + b, 0) / vals.length
                : m.rollup === "latest" ? vals[vals.length - 1]
                : m.rollup === "sum" ? vals.reduce((a, b) => a + b, 0)
                : m.rollup === "min" ? Math.min(...vals) : Math.max(...vals)
                : null;
              return (
                <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4 min-w-[140px] shadow-sm">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">{m.metricName}</p>
                  <p className="text-2xl font-bold text-teal-600">{rv !== null ? `${rv.toFixed(1)}${m.unit === "%" ? "%" : ""}` : "—"}</p>
                  {m.target !== null && <p className="text-xs text-slate-400 mt-1">target {m.direction === "down" ? "≤" : "≥"} {m.target}</p>}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Tabs - same as use-cases detail but with Post-Deployment first */}
      <Tabs defaultValue="post-deployment">
        <TabsList>
          <TabsTrigger value="post-deployment" className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 data-[state=active]:border-emerald-500">Post-Deployment</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="todos">To-Dos{openTodoCount > 0 ? ` (${openTodoCount})` : ""}</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="files">Files & Links{useCase.links.length > 0 ? ` (${useCase.links.length})` : ""}</TabsTrigger>
          <TabsTrigger value="comments">Comments{useCase.comments.length > 0 ? ` (${useCase.comments.length})` : ""}</TabsTrigger>
        </TabsList>

        {/* POST-DEPLOYMENT TAB with sub-tabs */}
        <TabsContent value="post-deployment" className="mt-4">
          <PostDeploymentSection
            useCaseId={id}
            monitoring={monitoring}
            monDesc={monDesc} setMonDesc={setMonDesc}
            monCadence={monCadence} setMonCadence={setMonCadence}
            monOwner={monOwner} setMonOwner={setMonOwner}
            monSaving={monSaving} saveMonitoring={saveMonitoring}
            metrics={metrics} setMetrics={setMetrics}
          />
        </TabsContent>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel title="Organization">
              <ComboField label="Business Area" value={useCase.businessArea} options={BUSINESS_AREAS} onSave={(v)=>save({businessArea:v})} />
              <ComboField label="Strategic Focus" value={useCase.strategicGoal} options={STRATEGIC_FOCUSES} onSave={(v)=>save({strategicGoal:v})} />
              <ComboField label="Workgroup" value={useCase.workgroup} options={WORKGROUPS} onSave={(v)=>save({workgroup:v})} />
              <ComboField label="Grouping" value={useCase.grouping} options={GROUPINGS} onSave={(v)=>save({grouping:v})} />
            </Panel>
            <Panel title="Ownership">
              <EditField label="Business Owner" value={useCase.businessOwner} onSave={(v)=>save({businessOwner:v})} />
              <EditField label="Use Case Owner" value={useCase.useCaseOwner} onSave={(v)=>save({useCaseOwner:v})} />
              <ComboField label="Vendor" value={useCase.developer} options={VENDORS} onSave={(v)=>save({developer:v})} />
            </Panel>
            <Panel title="Classification">
              <ComboField label="Solution Type" value={useCase.solutionType} options={SOLUTION_TYPES} onSave={(v)=>save({solutionType:v})} />
              <EditField label="Data Source" value={useCase.dataSource} onSave={(v)=>save({dataSource:v})} />
            </Panel>
          </div>
        </TabsContent>

        {/* TODOS TAB */}
        <TabsContent value="todos">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <ul className="space-y-1">
              {todos.map((t) => (
                <TodoRow key={t.id} todo={t} onToggle={() => handleToggle(t)} onDelete={() => handleDeleteTodo(t.id)}
                  onUpdateText={(v) => { setTodos(todos.map((x) => x.id === t.id ? { ...x, text: v } : x)); $updateTodo({ data: { id: t.id, text: v } }); }}
                  onUpdateAssignee={(v) => { setTodos(todos.map((x) => x.id === t.id ? { ...x, assignee: v } : x)); $updateTodo({ data: { id: t.id, assignee: v } }); }}
                />
              ))}
            </ul>
            {todos.length === 0 && <p className="text-sm text-slate-400 italic py-2">No to-dos yet.</p>}
            <div className="flex gap-2 pt-4 border-t border-slate-100 mt-4">
              <Input value={newTodoText} onChange={(e) => setNewTodoText(e.target.value)} placeholder="New to-do…" className="flex-1 h-9 text-sm" onKeyDown={(e) => e.key === "Enter" && handleAddTodo()} />
              <Input value={newTodoAssignee} onChange={(e) => setNewTodoAssignee(e.target.value)} placeholder="Owner" className="w-32 h-9 text-sm" onKeyDown={(e) => e.key === "Enter" && handleAddTodo()} />
              <Button variant="outline" size="sm" className="h-9 gap-1" onClick={handleAddTodo}><Plus className="size-3" /> Add</Button>
            </div>
          </div>
        </TabsContent>

        {/* NOTES TAB */}
        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Time Saved / Instance</p>
              <div className="flex items-center gap-2 mt-1">
                <input type="number" min={0} value={useCase.timeSavedValue ?? 0}
                  onChange={(e) => { const v = Number(e.target.value); save({ timeSavedValue: v, annualTimeSaved: calcAnnual(v, useCase.timeSavedUnit ?? "month") }); }}
                  className="text-2xl font-bold text-slate-900 w-24 border-b border-slate-200 outline-none bg-transparent focus:border-accent-indigo" />
                <span className="text-slate-400 text-sm">hrs</span>
                <span className="text-slate-400 text-sm">per</span>
                <Select value={useCase.timeSavedUnit ?? "month"} onValueChange={(v)=>save({timeSavedUnit:v, annualTimeSaved:calcAnnual(useCase.timeSavedValue??0,v)})}>
                  <SelectTrigger className="h-8 text-sm w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{(pageSettings["time_saved_unit"]?.length ? pageSettings["time_saved_unit"] : TIME_UNITS).map((u)=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Hours saved each time this solution runs</p>
            </div>
            <EditableMetricCard label="Annual Time Saved (hrs)" value={annualCalc} onSave={(v)=>save({annualTimeSaved:v})} suffix=" hrs" desc="Auto-calculated; edit to override" />
            <EditableMetricCard label="Cost Savings ($)" value={useCase.costSavings} onSave={(v)=>save({costSavings:v})} prefix="$" desc="Estimated annual dollar value" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EditableMetricCard label="Dev Lead Time (days)" value={useCase.devLeadTimeDays ?? 0} onSave={(v)=>save({devLeadTimeDays:v||null})} suffix=" days" desc="Days from project start to completion." />
            <EditableMetricCard label="Issue Resolution Time (days)" value={useCase.resolutionTimeDays ?? 0} onSave={(v)=>save({resolutionTimeDays:v||null})} suffix=" days" desc="Days to resolve a post-deployment issue." />
          </div>
          <Panel title="Effort">
            <p className="text-xs text-slate-500 mb-3">Owner-rated effort required before having the solution. 1 = minimal, 5 = very high.</p>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Effort Before</p>
                <div className="flex items-center gap-2">
                  {[1,2,3,4,5].map((n)=>(
                    <button key={n} onClick={()=>save({effortBefore:n as Effort})}
                      className={`size-10 rounded-lg text-sm font-bold transition-colors ${n===useCase.effortBefore?"bg-accent-indigo text-white shadow-md":"bg-slate-100 text-slate-500 hover:bg-accent-indigo/20 hover:text-accent-indigo"}`}>{n}</button>
                  ))}
                  <span className="text-xs text-slate-400 ml-2">{["","Minimal","Low","Medium","High","Very High"][useCase.effortBefore]}</span>
                </div>
              </div>
              {isDeploymentPlus && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">Effort After</p>
                  <div className="flex items-center gap-2">
                    {[1,2,3,4,5].map((n)=>(
                      <button key={n} onClick={()=>save({effortAfter:n as Effort})}
                        className={`size-10 rounded-lg text-sm font-bold transition-colors ${n===useCase.effortAfter?"bg-status-success text-white shadow-md":"bg-slate-100 text-slate-500 hover:bg-status-success/20 hover:text-status-success"}`}>{n}</button>
                    ))}
                    <span className="text-xs text-slate-400 ml-2">{["","Minimal","Low","Medium","High","Very High"][useCase.effortAfter]}</span>
                  </div>
                  {useCase.effortBefore > useCase.effortAfter && (
                    <p className="text-xs text-status-success mt-2 font-medium">Reduction: {useCase.effortBefore - useCase.effortAfter} points ({Math.round((useCase.effortBefore-useCase.effortAfter)/4*100)}%)</p>
                  )}
                </div>
              )}
              {!isDeploymentPlus && <p className="text-xs text-slate-400 italic">Effort After will appear once this use case moves to Deployment stage.</p>}
            </div>
          </Panel>
          {isDeploymentPlus && (
            <Panel title="Proactive vs Reactive">
              <p className="text-xs text-slate-500 mb-3">Is this solution primarily proactive or reactive?</p>
              <div className="flex gap-3">
                <button onClick={()=>save({proactivePct: useCase.proactivePct===100 ? null : 100, reactivePct: useCase.proactivePct===100 ? null : 0})}
                  className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors border-2 ${useCase.proactivePct===100?"bg-status-success text-white border-status-success":"border-slate-200 text-slate-500 hover:border-status-success/40"}`}>
                  ✓ Proactive
                </button>
                <button onClick={()=>save({proactivePct: useCase.proactivePct===0 ? null : 0, reactivePct: useCase.proactivePct===0 ? null : 100})}
                  className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors border-2 ${useCase.proactivePct===0?"bg-status-warning text-white border-status-warning":"border-slate-200 text-slate-500 hover:border-status-warning/40"}`}>
                  ✓ Reactive
                </button>
              </div>
            </Panel>
          )}
          {!isDeploymentPlus && <p className="text-xs text-slate-400 italic px-1">Proactive vs Reactive will appear once this use case moves to Deployment stage.</p>}
        </TabsContent>

        <TabsContent value="notes">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes</p>
              {notesSaving && <span className="text-xs text-slate-400">Saving…</span>}
            </div>
            <NotesEditor value={notes} onChange={autoSaveNotes} />
          </div>
        </TabsContent>

        {/* ACTIVITY TAB */}
        <TabsContent value="activity">
          <Panel title="Activity Timeline">
            <ol className="relative border-l border-slate-200 ml-2 space-y-6 pt-2">
              {[...useCase.activity].reverse().map((a)=>(
                <li key={a.id} className="pl-6 relative group"><span className="absolute -left-[7px] top-1 size-3 rounded-full bg-white border-2 border-accent-indigo" /><div className="flex items-start justify-between"><div><p className="text-xs text-slate-400 font-medium">{new Date(a.timestamp).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} · {fmtRel(a.timestamp)}</p><p className="text-sm text-slate-900 mt-0.5">{a.message}</p>{a.actor&&<p className="text-[11px] text-slate-500">by {a.actor}</p>}</div><button onClick={()=>deleteActivity(useCase.id,a.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-status-danger transition-all shrink-0"><Trash2 className="size-3" /></button></div></li>
              ))}
            </ol>
          </Panel>
        </TabsContent>

        {/* FILES & LINKS TAB */}
        <TabsContent value="files">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <FilesAndLinks links={useCase.links} onUpdate={(links) => save({ links })} />
          </div>
        </TabsContent>

        {/* COMMENTS TAB */}
        <TabsContent value="comments">
          <Panel title="Discussion">
            <div className="space-y-4">
              {useCase.comments.map((c)=>(
                <div key={c.id} className="flex gap-3 group">
                  <OwnerAvatar name={c.author} size={28} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{c.author}</span>
                      <span className="text-xs text-slate-400">{fmtRel(c.timestamp)}</span>
                      <button onClick={()=>deleteComment(useCase.id,c.id)} className="opacity-0 group-hover:opacity-100 ml-auto text-slate-300 hover:text-status-danger transition-all"><Trash2 className="size-3" /></button>
                    </div>
                    <p className="text-sm text-slate-700 mt-1">{c.text}</p>
                  </div>
                </div>
              ))}
              <div className="border-t border-slate-100 pt-4">
                <Textarea placeholder="Write a comment…" value={comment} onChange={(e)=>setComment(e.target.value)} rows={3} />
                <div className="mt-2 flex justify-end"><Button size="sm" className="bg-accent-indigo hover:bg-accent-indigo/90 text-white" onClick={()=>{ if(!comment.trim())return; addComment(useCase.id,comment.trim()); setComment(""); }}>Post comment</Button></div>
              </div>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
      

    </div>
  );
}

// ============================================================================
// Post-Deployment Section (sub-tabs: Process, Metrics)
// ============================================================================
function PostDeploymentSection({ useCaseId, monitoring, monDesc, setMonDesc, monCadence, setMonCadence, monOwner, setMonOwner, monSaving, saveMonitoring, metrics, setMetrics }: {
  useCaseId: string;
  monitoring: LiveMonitoring | null;
  monDesc: string; setMonDesc: (v: string) => void;
  monCadence: string; setMonCadence: (v: string) => void;
  monOwner: string; setMonOwner: (v: string) => void;
  monSaving: boolean; saveMonitoring: () => void;
  metrics: LiveMetric[]; setMetrics: (m: LiveMetric[]) => void;
}) {
  const [subTab, setSubTab] = useState<"process"|"metrics">("process");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200">
        <button onClick={() => setSubTab("process")} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${subTab === "process" ? "border-accent-indigo text-accent-indigo" : "border-transparent text-slate-500 hover:text-slate-700"}`}>Process</button>
        <button onClick={() => setSubTab("metrics")} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${subTab === "metrics" ? "border-accent-indigo text-accent-indigo" : "border-transparent text-slate-500 hover:text-slate-700"}`}>Metrics</button>
      </div>

      {subTab === "process" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Post-Deployment Monitoring Process</p>
            <Button variant="outline" size="sm" className="gap-1" onClick={saveMonitoring} disabled={monSaving}>
              <Save className="size-3" />{monSaving ? "Saving…" : "Save"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Cadence</label>
              <Select value={monCadence} onValueChange={setMonCadence}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{CADENCE_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Monitoring Owner</label>
              <Input value={monOwner} onChange={(e) => setMonOwner(e.target.value)} placeholder="Owner name" className="h-9 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">How We Monitor</label>
            <NotesEditor value={monDesc} onChange={setMonDesc} />
          </div>
        </div>
      )}

      {subTab === "metrics" && (
        <MetricsTab useCaseId={useCaseId} metrics={metrics} setMetrics={setMetrics} />
      )}
    </div>
  );
}

// ============================================================================
// Metrics Tab - editable table with period columns
// ============================================================================

// ── Sparkline (SVG mini trend chart) ──────────────────────────────────────────

function MetricsTab({ useCaseId, metrics, setMetrics }: {
  useCaseId: string; metrics: LiveMetric[]; setMetrics: (m: LiveMetric[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newPeriod, setNewPeriod] = useState("");
  const storageKey = `qx-metrics-cols-${useCaseId}`;
  const [periodColumns, setPeriodColumnsRaw] = useState<string[]>(() => {
    try { const saved = localStorage.getItem(storageKey); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const setPeriodColumns = (cols: string[]) => {
    setPeriodColumnsRaw(cols);
    localStorage.setItem(storageKey, JSON.stringify(cols));
  };
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Merge DB periods + manually added columns (new columns appear at the right)
  const dbPeriods = Array.from(new Set(metrics.flatMap((m) => Object.keys(m.periodValues))));
  const allPeriods = [...dbPeriods.filter((p) => !periodColumns.includes(p)), ...periodColumns];
  // Remove duplicates while preserving order
  const displayPeriods = Array.from(new Set(allPeriods));

  const addRow = async () => {
    if (!newName.trim()) return;
    const m = await $addMetric({ data: { useCaseId, metricName: newName.trim(), unit: "%", target: null, starred: false } });
    setMetrics([...metrics, m]);
    setNewName("");
  };

  const addPeriodColumn = () => {
    const col = newPeriod.trim();
    if (!col || displayPeriods.includes(col)) return;
    setPeriodColumns([...periodColumns, col]);
    setNewPeriod("");
  };

  const deletePeriodColumn = (col: string) => {
    // Remove from manual columns
    setPeriodColumns(periodColumns.filter((c) => c !== col));
    // Remove values from all metrics for this period
    const updated = metrics.map((m) => {
      const newVals = { ...m.periodValues };
      delete newVals[col];
      return { ...m, periodValues: newVals };
    });
    setMetrics(updated);
    // Persist each metric's periodValues
    updated.forEach((m) => {
      $updateMetric({ data: { id: m.id, periodValues: m.periodValues } });
    });
  };

  const toggleStar = async (m: LiveMetric) => {
    // Optimistic update first for instant feedback
    const newStarred = !m.starred;
    setMetrics(metrics.map((x) => x.id === m.id ? { ...x, starred: newStarred } : x));
    // Then persist
    try {
      await $updateMetric({ data: { id: m.id, starred: newStarred } });
    } catch (err) {
      // Revert on failure
      console.error("Failed to update star:", err);
      setMetrics(metrics.map((x) => x.id === m.id ? { ...x, starred: m.starred } : x));
    }
  };

  const updateField = async (m: LiveMetric, field: string, value: unknown) => {
    setMetrics(metrics.map((x) => x.id === m.id ? { ...x, [field]: value } : x));
    await $updateMetric({ data: { id: m.id, [field]: value } });
  };

  const deleteRow = async (m: LiveMetric) => {
    setMetrics(metrics.filter((x) => x.id !== m.id));
    await $deleteMetric({ data: { id: m.id } });
  };

  // Column drag & drop
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...displayPeriods];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    setPeriodColumns(reordered);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left w-8"></th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase min-w-[150px]">Metric</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase w-16">Unit</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase w-16">Target</th>
                {displayPeriods.map((p, idx) => (
                  <th key={p} className="px-1 py-2 text-center text-xs font-semibold text-slate-500 uppercase min-w-[70px] cursor-grab select-none group"
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}>
                    <div className="flex items-center justify-center gap-0.5">
                      <span>{p}</span>
                      <button onClick={() => deletePeriodColumn(p)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity ml-0.5" title="Remove column">
                        <X className="size-3" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 text-center text-xs font-semibold text-slate-500 uppercase w-20">Trend</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase w-24">Roll-up</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0 && (
                <tr><td colSpan={6 + displayPeriods.length} className="px-4 py-8 text-center text-slate-400 italic">No metrics added yet. Add a metric row below.</td></tr>
              )}
              {metrics.map((m) => {
                const periodVals = displayPeriods.map((p) => m.periodValues[p] ?? null);
                const filledVals = periodVals.filter((v) => v !== null) as number[];
                const rollupVal = filledVals.length > 0
                  ? m.rollup === "avg" ? (filledVals.reduce((a, b) => a + b, 0) / filledVals.length).toFixed(1)
                  : m.rollup === "latest" ? String(filledVals[filledVals.length - 1])
                  : m.rollup === "sum" ? String(filledVals.reduce((a, b) => a + b, 0))
                  : m.rollup === "min" ? String(Math.min(...filledVals))
                  : String(Math.max(...filledVals))
                  : "—";
                return (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2">
                      <button onClick={() => toggleStar(m)} className={m.starred ? "text-amber-500" : "text-slate-300 hover:text-amber-400"} title="Pin as KPI">
                        <Star className={`size-4 ${m.starred ? "fill-amber-500" : ""}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2 min-w-[150px] max-w-[200px]">
                      <input className="bg-transparent border-0 outline-none text-sm font-medium w-full whitespace-normal break-words" value={m.metricName}
                        onChange={(e) => setMetrics(metrics.map((x) => x.id === m.id ? { ...x, metricName: e.target.value } : x))}
                        onBlur={(e) => updateField(m, "metricName", e.target.value)} />
                    </td>
                    <td className="px-3 py-2">
                      <Select value={m.unit} onValueChange={(v) => updateField(m, "unit", v)}>
                        <SelectTrigger className="h-7 text-xs border-slate-200 w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>{METRIC_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="number" className="bg-transparent border-0 outline-none text-sm w-14 text-center" value={m.target ?? ""} placeholder="—"
                        onChange={(e) => setMetrics(metrics.map((x) => x.id === m.id ? { ...x, target: e.target.value ? Number(e.target.value) : null } : x))}
                        onBlur={(e) => updateField(m, "target", e.target.value ? Number(e.target.value) : null)} />
                    </td>
                    {displayPeriods.map((p) => (
                      <td key={p} className="px-1 py-2 text-center">
                        <input type="number" className="bg-transparent border border-slate-200 rounded outline-none text-sm w-14 text-center py-1 focus:border-accent-indigo focus:ring-1 focus:ring-accent-indigo/20"
                          value={m.periodValues[p] ?? ""}
                          placeholder="—"
                          onChange={(e) => {
                            const newVals = { ...m.periodValues };
                            if (e.target.value) newVals[p] = Number(e.target.value); else delete newVals[p];
                            setMetrics(metrics.map((x) => x.id === m.id ? { ...x, periodValues: newVals } : x));
                          }}
                          onBlur={() => updateField(m, "periodValues", m.periodValues)} />
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <Sparkline values={periodVals} target={m.target} direction={m.direction} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Select value={m.rollup} onValueChange={(v) => updateField(m, "rollup", v)}>
                          <SelectTrigger className="h-7 text-xs border-slate-200 w-20"><SelectValue /></SelectTrigger>
                          <SelectContent>{ROLLUP_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                        </Select>
                        <span className={`text-xs font-bold ${m.starred ? "text-teal-600" : "text-slate-500"}`}>{rollupVal}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => deleteRow(m)} className="text-slate-300 hover:text-red-500"><Trash2 className="size-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Add metric row + add period column */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New metric name…" className="flex-1 h-9 text-sm min-w-40" onKeyDown={(e) => e.key === "Enter" && addRow()} />
          <Button size="sm" variant="outline" onClick={addRow} className="gap-1 h-9"><Plus className="size-3" />Add metric</Button>
          <div className="w-px h-6 bg-slate-200 mx-2" />
          <Input value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} placeholder="e.g. Jun-26, W28, Q3" className="w-40 h-9 text-sm" onKeyDown={(e) => e.key === "Enter" && addPeriodColumn()} />
          <Button size="sm" variant="outline" onClick={addPeriodColumn} className="gap-1 h-9"><Plus className="size-3" />Add column</Button>
        </div>
      </div>
      <p className="text-xs text-slate-400">★ Star rows to pin as KPIs. Drag column headers to reorder. Hover column headers to delete. Values save on blur.</p>
    </div>
  );
}

// Sparkline micro-chart
function Sparkline({ values, target, direction }: { values: (number | null)[]; target?: number | null; direction?: string }) {
  const filled = values.filter((v) => v !== null) as number[];
  if (filled.length < 2) return <span className="text-slate-300 text-xs">—</span>;
  const min = Math.min(...filled);
  const max = Math.max(...filled);
  const range = max - min || 1;
  const w = 64;
  const h = 24;
  const pad = 2;
  const points = filled.map((v, i) => {
    const x = pad + (i / (filled.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");

  // Determine color: trending in the right direction = green, wrong = red
  const last = filled[filled.length - 1];
  const first = filled[0];
  const improving = direction === "down" ? last <= first : last >= first;
  const color = improving ? "#10b981" : "#ef4444";

  return (
    <svg width={w} height={h} className="inline-block">
      {target != null && (() => {
        const ty = h - pad - ((target - min) / range) * (h - pad * 2);
        const clampedY = Math.max(pad, Math.min(h - pad, ty));
        return <line x1={pad} y1={clampedY} x2={w - pad} y2={clampedY} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2,2" />;
      })()}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dot on last point */}
      {(() => {
        const lastX = pad + ((filled.length - 1) / (filled.length - 1)) * (w - pad * 2);
        const lastY = h - pad - ((last - min) / range) * (h - pad * 2);
        return <circle cx={lastX} cy={lastY} r="2.5" fill={color} />;
      })()}
    </svg>
  );
}

