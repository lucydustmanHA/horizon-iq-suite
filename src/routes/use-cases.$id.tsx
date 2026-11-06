
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { usePortfolio } from "../lib/store";
import { $loadPortfolios, $addUseCasesToPortfolio, $removeUseCasesFromPortfolio } from "../lib/portfolios.server";
import { useCallback } from "react";
import { WORKGROUPS, STAGES, STATUSES, BUSINESS_AREAS, STRATEGIC_FOCUSES, GROUPINGS, VENDORS, SOLUTION_TYPES, TIME_UNITS, type Stage, type Status, type Effort, type TodoItem } from "../lib/types";
import { StageBadge, PriorityBadge, FlagBadge, OwnerAvatar } from "../components/badges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { ChevronLeft, ChevronDown, ChevronRight, Pencil, Check, X, Link2, Plus, CheckSquare, Square, Trash2, Paperclip, Unlink, CalendarDays, MessageSquare } from "lucide-react";
import { NotesEditor } from "../components/notes-editor";
import { $getTodos, $addTodo, $updateTodo, $deleteTodo, $saveNotes, $deleteUseCase, $getLinkedCases, $addLink, $removeLink, $postStatusUpdate } from "../lib/use-cases.server";
import type { UseCaseLink } from "../lib/use-cases.server";
import { useCurrentUser } from "../lib/user-context";
import { $upsertSettingOption } from "../lib/settings.server";
import type { LiveMetric, LiveMonitoring } from "../lib/live-mock-data";
import { $getMonitoring, $upsertMonitoring, $getMetrics, $updateReviewCycle } from "../lib/live.server";
import { normalizeReviewCycle } from "../lib/live-review-utils";
import { PostDeploymentSection, MetricsTab } from "../components/post-deployment-section";

export const Route = createFileRoute("/use-cases/$id")({
  component: DetailPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
  }),
  notFoundComponent: () => <div className="p-16 text-center"><h1 className="text-xl font-semibold">Use case not found</h1><Link to="/use-cases" className="text-accent-indigo text-sm mt-2 inline-block">Back to list</Link></div>,
});

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
const fmtRel = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000); if (d < 1) return "today"; if (d === 1) return "yesterday"; if (d < 30) return `${d}d ago`; if (d < 365) return `${Math.floor(d/30)}mo ago`; return `${Math.floor(d/365)}y ago`; };

const ANNUAL_MULTIPLIER: Record<string, number> = { day: 260, week: 52, month: 12, quarter: 4, year: 1, once: 1 };
function calcAnnual(value: number, unit: string) { return Math.round(value * (ANNUAL_MULTIPLIER[unit] ?? 12)); }

// ── Edit helpers ─────────────────────────────────────────────────────────────
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

function TitleEdit({ value, onSave }: { value:string; onSave:(v:string)=>void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{ setDraft(value); },[value]);
  useEffect(()=>{ if(editing&&ref.current){ref.current.focus();ref.current.select();} },[editing]);
  const save = ()=>{ setEditing(false); if(draft.trim()!==value)onSave(draft.trim()); };
  if(editing) return <textarea ref={ref} rows={2} className="text-2xl font-bold tracking-tight w-full border-b-2 border-accent-indigo outline-none bg-transparent resize-none" value={draft} onChange={(e)=>setDraft(e.target.value)} onBlur={save} onKeyDown={(e)=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();save();} if(e.key==="Escape"){setEditing(false);setDraft(value);} }} />;
  return <h1 className="text-2xl font-bold tracking-tight cursor-pointer hover:text-accent-indigo transition-colors group flex items-center gap-2" onClick={()=>setEditing(true)}>{value}<Pencil className="size-4 opacity-0 group-hover:opacity-40 shrink-0" /></h1>;
}
function DescEdit({ value, onSave }: { value:string; onSave:(v:string)=>void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(()=>{ setDraft(value); },[value]);
  const save = ()=>{ setEditing(false); if(draft.trim()!==value)onSave(draft.trim()); };
  if(editing) return <div><Textarea autoFocus value={draft} onChange={(e)=>setDraft(e.target.value)} onBlur={save} rows={3} className="text-sm w-full" /><button onClick={save} className="mt-1 text-xs text-accent-indigo font-medium flex items-center gap-1"><Check className="size-3" /> Save</button></div>;
  return <p className="text-sm text-slate-600 mt-2 cursor-pointer hover:text-slate-900 transition-colors group flex items-start gap-1" onClick={()=>setEditing(true)}><span>{value||<span className="italic text-slate-400">Click to add description…</span>}</span><Pencil className="size-3 mt-0.5 opacity-0 group-hover:opacity-40 shrink-0" /></p>;
}

// ── Metrics helpers ───────────────────────────────────────────────────────────
function EditableMetricCard({ label, value, onSave, prefix="", suffix="", desc }: { label:string; value:number; onSave:(v:number)=>void; prefix?:string; suffix?:string; desc?:string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(()=>{ setDraft(String(value)); },[value]);
  useEffect(()=>{ if(editing)ref.current?.select(); },[editing]);
  const save = ()=>{ setEditing(false); const stripped=draft.replace(/[^0-9.]/g,""); if(stripped===""||stripped==="."){ if(value!==0)onSave(0); return; } const n=parseFloat(stripped); if(!isNaN(n)&&n!==value)onSave(n); };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm cursor-pointer group" onClick={()=>!editing&&setEditing(true)}>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      {editing ? <input ref={ref} autoFocus value={draft} onChange={(e)=>setDraft(e.target.value)} onBlur={save} onKeyDown={(e)=>{ if(e.key==="Enter")save(); if(e.key==="Escape"){setEditing(false);setDraft(String(value));} }} className="text-2xl font-bold text-accent-indigo w-full border-b-2 border-accent-indigo outline-none bg-transparent" />
        : <p className="text-2xl font-bold text-slate-900 group-hover:text-accent-indigo transition-colors">{prefix}{value.toLocaleString()}{suffix}</p>}
      {desc && <p className="text-[10px] text-slate-400 mt-1 leading-snug">{desc}</p>}
      {!editing && <p className="text-[10px] text-slate-300 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">click to edit</p>}
    </div>
  );
}

function PortfolioPicker({ useCaseId }: { useCaseId: string }) {
  const [portfolios, setPortfolios] = useState<{id:string;name:string;color:string}[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      $loadPortfolios(),
      import("../lib/portfolios.server").then(m => m.$getPortfoliosForUseCase({ data: { useCaseId } }))
    ]).then(([ps, ids]) => { setPortfolios(ps); setAssigned(ids); setLoaded(true); });
  }, [useCaseId]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = async (portfolioId: string) => {
    if (assigned.includes(portfolioId)) {
      await $removeUseCasesFromPortfolio({ data: { portfolioId, useCaseIds: [useCaseId] } });
      setAssigned((a) => a.filter((id) => id !== portfolioId));
    } else {
      await $addUseCasesToPortfolio({ data: { portfolioId, useCaseIds: [useCaseId] } });
      setAssigned((a) => [...a, portfolioId]);
    }
  };

  const display = loaded
    ? (assigned.length ? portfolios.filter(p => assigned.includes(p.id)).map(p => p.name).join(", ") : "—")
    : "…";

  return (
    <div className="flex justify-between items-center gap-4 text-sm group" ref={ref}>
      <span className="text-slate-500 shrink-0">Portfolios</span>
      <div className="relative">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-slate-900 font-medium text-right hover:text-accent-indigo transition-colors">
          <span className="max-w-[180px] truncate">{assigned.length ? display : <span className="text-slate-400 italic font-normal">—</span>}</span>
          <svg className="size-3.5 opacity-40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-md shadow-md py-1 z-50 min-w-[200px] max-h-64 overflow-auto">
            {portfolios.map((p) => (
              <button key={p.id} onClick={() => toggle(p.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-left transition-colors">
                <span className="size-2.5 rounded-full shrink-0" style={{backgroundColor: p.color}} />
                <span className="flex-1 text-slate-700">{p.name}</span>
                {assigned.includes(p.id) && <svg className="size-4 text-accent-indigo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>}
              </button>
            ))}
            {portfolios.length === 0 && <p className="px-3 py-2 text-xs text-slate-400 italic">No portfolios created yet</p>}
          </div>
        )}
      </div>
    </div>
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
            <a href={href} target="_blank" rel="noreferrer" className="text-accent-indigo hover:underline flex-1 truncate cursor-pointer"
              onClick={(e) => { if(type === "file") { e.preventDefault(); const a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); } }}
            >{name}</a>
            <button onClick={() => onUpdate(links.filter((_, j) => j !== i))} className="text-slate-400 hover:text-status-danger"><X className="size-3" /></button>
          </div>
        );
      })}
      <div className="flex gap-2 pt-2 flex-wrap">
        <Input value={newLink} onChange={(e) => setNewLink(e.target.value)} placeholder="Paste a URL"
          className="h-8 text-sm flex-1 min-w-40" onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="sm" variant="outline" onClick={add} className="gap-1 h-8 px-3"><Plus className="size-3" /> Add URL</Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1 h-8 px-3 text-slate-600">
          <Paperclip className="size-3" /> Attach file
        </Button>
        <input ref={fileRef} type="file" className="hidden" onChange={attachFile} />
      </div>
      <p className="text-[10px] text-slate-400">Add URLs (SharePoint, Google Docs, etc.) or attach files up to 5 MB — stored directly.</p>
    </div>
  );
}

function TodoRow({ todo, onToggle, onDelete, onUpdateText, onUpdateAssignee, onUpdateDueDate }: { todo:TodoItem; onToggle:()=>void; onDelete:()=>void; onUpdateText:(v:string)=>void; onUpdateAssignee:(v:string)=>void; onUpdateDueDate:(v:string|null)=>void }) {
  const [editText, setEditText] = useState(false);
  const [editAssignee, setEditAssignee] = useState(false);
  const [tDraft, setTDraft] = useState(todo.text);
  const [aDraft, setADraft] = useState(todo.assignee);
  const isOverdue = todo.dueDate && !todo.done && new Date(todo.dueDate + "T23:59:59") < new Date();
  useEffect(()=>{ setTDraft(todo.text); setADraft(todo.assignee); },[todo.text,todo.assignee]);
  return (
    <li className="flex items-start gap-2 group rounded-lg p-2 hover:bg-slate-50 transition-colors">
      <button onClick={onToggle} className="mt-0.5 shrink-0 text-slate-400 hover:text-accent-indigo transition-colors">{todo.done?<CheckSquare className="size-4 text-status-success"/>:<Square className="size-4"/>}</button>
      <div className="flex-1 min-w-0">
        {editText
          ? <input autoFocus value={tDraft} onChange={(e)=>setTDraft(e.target.value)} className="text-sm w-full border-b border-accent-indigo outline-none bg-transparent" onBlur={()=>{ setEditText(false); if(tDraft.trim()!==todo.text)onUpdateText(tDraft.trim()); }} onKeyDown={(e)=>{ if(e.key==="Enter"){setEditText(false);if(tDraft.trim()!==todo.text)onUpdateText(tDraft.trim());} if(e.key==="Escape"){setEditText(false);setTDraft(todo.text);} }} />
          : <p className={`text-sm cursor-pointer ${todo.done?"line-through text-slate-400":"text-slate-900"}`} onClick={()=>setEditText(true)}>{todo.text||<span className="italic text-slate-300">untitled</span>}</p>
        }
        <div className="flex items-center gap-3 mt-0.5">
          {editAssignee
            ? <input autoFocus value={aDraft} onChange={(e)=>setADraft(e.target.value)} placeholder="Assigned to…" className="text-xs border-b border-accent-indigo outline-none bg-transparent text-slate-500" onBlur={()=>{ setEditAssignee(false); if(aDraft!==todo.assignee)onUpdateAssignee(aDraft); }} onKeyDown={(e)=>{ if(e.key==="Enter"){setEditAssignee(false);if(aDraft!==todo.assignee)onUpdateAssignee(aDraft);} if(e.key==="Escape"){setEditAssignee(false);setADraft(todo.assignee);} }} />
            : <p className="text-xs text-slate-400 cursor-pointer hover:text-accent-indigo" onClick={()=>setEditAssignee(true)}>{todo.assignee?`→ ${todo.assignee}`:<span className="italic opacity-50">unassigned</span>}</p>
          }
          <span className="text-slate-200">·</span>
          <label className={`inline-flex items-center gap-1 text-xs cursor-pointer transition-colors ${isOverdue ? "text-red-500 font-medium" : todo.dueDate ? "text-slate-500" : "text-slate-300 hover:text-slate-400"}`}>
            <CalendarDays className="size-3" />
            <input type="date" value={todo.dueDate ?? ""} onChange={(e) => onUpdateDueDate(e.target.value || null)} className="bg-transparent border-0 outline-none text-xs p-0 w-24 cursor-pointer" />
          </label>
        </div>
      </div>
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-status-danger transition-all mt-0.5 shrink-0"><Trash2 className="size-3.5"/></button>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function DetailPage() {
  const { id } = Route.useParams();
  const useCase = usePortfolio((s) => s.useCases.find((u) => u.id === id));
  const updateUseCase = usePortfolio((s) => s.updateUseCase);
  const addComment      = usePortfolio((s) => s.addComment);
  const deleteComment    = usePortfolio((s) => s.deleteComment);
  const refreshComments  = usePortfolio((s) => s.refreshComments);
  const deleteUseCase    = usePortfolio((s) => s.deleteUseCase);
  const deleteActivity   = usePortfolio((s) => s.deleteActivity);
  const navigate       = useNavigate();
  const { tab: urlTab } = Route.useSearch();
  const pageSettings  = usePortfolio((s) => s.settings);
  const currentUser = useCurrentUser();
  const [comment, setComment] = useState("");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todosLoaded, setTodosLoaded] = useState(false);
  const [linkedCases, setLinkedCases] = useState<UseCaseLink[]>([]);
  const [linkSearchOpen, setLinkSearchOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linksExpanded, setLinksExpanded] = useState(true);
  const allUseCases = usePortfolio((s) => s.useCases);
  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoAssignee, setNewTodoAssignee] = useState("");
  const [newTodoDue, setNewTodoDue] = useState("");
  const [monitoring, setMonitoring] = useState<LiveMonitoring | null>(null);
  const [metrics, setMetrics] = useState<LiveMetric[]>([]);
  const [monDesc, setMonDesc] = useState("");
  const [monCadence, setMonCadence] = useState("Weekly");
  const [monOwner, setMonOwner] = useState("");
  const [monSaving, setMonSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  // Scroll to bottom when arriving at To-Dos tab from calendar
  useEffect(() => {
    if (urlTab === "todos") {
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 500);
    }
  }, [urlTab]);

  useEffect(() => {
    $getTodos({ data: { useCaseId: id } }).then((t) => { setTodos(t); setTodosLoaded(true); });
    $getLinkedCases({ data: { useCaseId: id } }).then(setLinkedCases).catch(console.error);
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

  if (!useCase) throw notFound();
  const save = (patch: Parameters<typeof updateUseCase>[1]) => updateUseCase(useCase.id, patch);

  const hasPostDeploymentHistory = !!useCase.lastCompletedAt || useCase.activity.some((a) =>
    a.type === "stage_change" && (a.message.includes(" to Deployment") || a.message.includes(" to Live") || a.message.includes(" to Closed"))
  );
  const isDeploymentPlus = ["Deployment", "Live", "Closed"].includes(useCase.stage) || hasPostDeploymentHistory || monitoring !== null || metrics.length > 0 || useCase.effortAfter > 0 || useCase.proactivePct != null;
  const priorityLabel = useCase.priority === 1 ? "2026" : useCase.priority === 2 ? "2027+" : "—";
  const annualCalc = calcAnnual(useCase.timeSavedValue ?? 0, useCase.timeSavedUnit ?? "month");

  const handleAddTodo = async () => {
    const text = newTodoText.trim();
    if (!text) return;
    const t = await $addTodo({ data: { useCaseId: id, text, assignee: newTodoAssignee.trim(), dueDate: newTodoDue || undefined } });
    setTodos((prev) => [...prev, t]);
    // auto-flag in store
    if (!useCase.status || (useCase.status !== "Blocked" && useCase.status !== "Action Needed")) {
      save({ status: "Action Needed" });
    }
    setNewTodoText(""); setNewTodoAssignee(""); setNewTodoDue("");
  };
  const handleToggle = async (t: TodoItem) => {
    const nowDone = !t.done;
    const updatedTodos = todos.map((x) => x.id === t.id ? { ...x, done: nowDone } : x);
    setTodos(updatedTodos);
    // Auto-clear Action Needed when all todos are checked off
    if (nowDone && updatedTodos.every((x) => x.done) && useCase.status === "Action Needed") {
      save({ status: "" });
    }
    await $updateTodo({ data: { id: t.id, done: nowDone } });
  };
  const handlePermanentDelete = async () => {
    const answer = window.prompt(
      `Type "${useCase.id}" to permanently delete this use case and all its to-dos. This cannot be undone.`
    );
    if (answer !== useCase.id) return;
    try {
      await $deleteUseCase({ data: { id: useCase.id } });
      deleteUseCase(useCase.id);
      navigate({ to: "/use-cases" });
    } catch (e) {
      console.error("delete failed", e);
    }
  };

  const handleDelete = async (todoId: string) => {
    const remaining = todos.filter((x) => x.id !== todoId);
    setTodos(remaining);
    if (remaining.every((x) => x.done) && useCase.status === "Action Needed") {
      save({ status: "" });
    }
    await $deleteTodo({ data: { id: todoId } });
  };

  const saveMonitoring = async () => {
    setMonSaving(true);
    try {
      const result = await $upsertMonitoring({
        data: {
          useCaseId: id,
          description: monDesc,
          tools: [],
          cadence: monCadence,
          monitoringOwner: monOwner,
          approach: monitoring?.approach ?? "",
        },
      });
      setMonitoring(result);
    } finally {
      setMonSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 overflow-x-hidden">
      <button onClick={() => window.history.back()} className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"><ChevronLeft className="size-4" /> Back</button>

      {/* Header */}
      <header className={`border rounded-xl p-6 shadow-sm ${useCase.status === "Blocked" ? "bg-red-50/30 border-red-200" : useCase.status === "Action Needed" ? "bg-amber-50/30 border-amber-200" : "bg-white border-slate-200"}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-slate-400 mb-1">{useCase.id}</p>
            <TitleEdit value={useCase.title} onSave={(v) => save({ title: v })} />
            <DescEdit value={useCase.description} onSave={(v) => save({ description: v })} />
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <StageBadge stage={useCase.stage} />
            <FlagBadge status={useCase.status} />
            <button
              onClick={() => save({ closeToCompletion: !useCase.closeToCompletion })}
              title={useCase.closeToCompletion ? "Marked as close to completion (click to remove)" : "Mark as close to completion"}
              className={"size-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all " + (useCase.closeToCompletion ? "bg-teal-500 border-teal-500 text-white shadow-sm" : "border-slate-300 text-slate-300 hover:border-teal-400 hover:text-teal-400")}
            >C</button>
          </div>
        </div>
        {/* Header facets — all editable */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 text-sm">
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

      {/* ── Status Update blurb ── */}
      <div className="border border-slate-200 rounded-lg bg-slate-50/50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <MessageSquare className="size-4 text-slate-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              {editingStatus ? (
                <div className="space-y-2">
                  <textarea autoFocus value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)} rows={2} placeholder="What's the latest on this use case?" className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-accent-indigo/40 resize-none" onKeyDown={(e) => { if (e.key === "Escape") { setEditingStatus(false); setStatusDraft(""); } }} />
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="h-7 text-xs bg-accent-indigo hover:bg-accent-indigo/90 text-white" disabled={!statusDraft.trim() || statusSaving} onClick={async () => {
                      setStatusSaving(true);
                      try {
                        const result = await $postStatusUpdate({ data: { id: useCase.id, update: statusDraft.trim() } });
                        if (result.ok) {
                          save({ statusUpdate: result.statusUpdate, statusUpdateDate: result.statusUpdateDate, notes: result.notes } as any);
                          setEditingStatus(false); setStatusDraft("");
                        }
                      } finally { setStatusSaving(false); }
                    }}>{statusSaving ? "Saving…" : "Post Update"}</Button>
                    <button className="text-xs text-slate-400 hover:text-slate-600" onClick={() => { setEditingStatus(false); setStatusDraft(""); }}>Cancel</button>
                  </div>
                </div>
              ) : useCase.statusUpdate ? (
                <div>
                  <p className="text-sm text-slate-700">{useCase.statusUpdate}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{useCase.statusUpdateDate ? new Date(useCase.statusUpdateDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">No status update yet</p>
              )}
            </div>
          </div>
          {!editingStatus && (
            <button onClick={() => { setStatusDraft(""); setEditingStatus(true); }} className="text-xs text-slate-400 hover:text-accent-indigo shrink-0 flex items-center gap-1 transition-colors"><Pencil className="size-3" /> {useCase.statusUpdate ? "Update" : "Add"}</button>
          )}
        </div>
      </div>

      {/* ── Linked Cases (Asana-style, collapsible) ── */}
      <div className="border-b border-slate-200">
        <div className="flex items-center justify-between py-2">
          <button onClick={() => setLinksExpanded(!linksExpanded)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors">
            {linksExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Linked Cases{linkedCases.length > 0 ? ` (${linkedCases.length})` : ""}
          </button>
          <button onClick={() => { setLinkSearchOpen(true); setLinksExpanded(true); }} className="text-xs text-slate-400 hover:text-accent-indigo transition-colors flex items-center gap-1"><Plus className="size-3" /> Link</button>
        </div>
        {linksExpanded && (
          <div className="pb-3">
            {linkedCases.length === 0 && !linkSearchOpen && <p className="text-sm text-slate-300 italic pl-5">No linked cases</p>}
            {linkedCases.map((lc) => (
              <div key={lc.linkId} className="group flex items-center gap-3 py-1.5 pl-5 pr-1 hover:bg-slate-50 rounded transition-colors">
                <Link2 className="size-3 text-slate-300 shrink-0" />
                <Link to={`/use-cases/${lc.id}`} className="flex-1 min-w-0 text-sm text-slate-700 hover:text-accent-indigo transition-colors truncate">{lc.title}</Link>
                {lc.status && <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 " + (lc.status === "Active" ? "bg-teal-50 text-teal-600" : lc.status === "Action Needed" ? "bg-amber-50 text-amber-600" : lc.status === "Completed" ? "bg-green-50 text-green-600" : lc.status === "Blocked" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500")}>{lc.status}</span>}
                <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">{lc.workgroup}</span>
                <button onClick={() => { $removeLink({ data: { linkId: lc.linkId } }).then(() => setLinkedCases((p) => p.filter((x) => x.linkId !== lc.linkId))).catch(console.error); }} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all shrink-0 p-0.5"><X className="size-3" /></button>
              </div>
            ))}
            {linkSearchOpen && (
              <div className="pl-5 pr-1 pt-1 space-y-1">
                <Input autoFocus value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder="Search use cases…" className="h-7 text-xs border-slate-200" onKeyDown={(e) => e.key === "Escape" && (setLinkSearchOpen(false), setLinkSearch(""))} />
                <ul className="max-h-40 overflow-y-auto">
                  {allUseCases.filter((uc) => uc.id !== id && !linkedCases.some((lc) => lc.id === uc.id) && (uc.title.toLowerCase().includes(linkSearch.toLowerCase()) || uc.workgroup.toLowerCase().includes(linkSearch.toLowerCase()))).slice(0, 8).map((uc) => (
                    <li key={uc.id}>
                      <button className="w-full text-left px-2 py-1.5 rounded text-sm text-slate-600 hover:bg-teal-50 hover:text-teal-700 transition-colors flex items-center justify-between gap-2" onClick={() => { $addLink({ data: { sourceId: id, targetId: uc.id } }).then(() => $getLinkedCases({ data: { useCaseId: id } }).then(setLinkedCases)).catch(console.error); setLinkSearch(""); setLinkSearchOpen(false); }}>
                        <span className="truncate">{uc.title}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">{uc.workgroup}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button onClick={() => { setLinkSearchOpen(false); setLinkSearch(""); }} className="text-[10px] text-slate-400 hover:text-slate-600">Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue={urlTab || "overview"}>
        <TabsList className="overflow-x-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="todos">
            To-Dos{todos.filter(t=>!t.done).length > 0 ? ` (${todos.filter(t=>!t.done).length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="files">
            Files & Links{useCase.links.length > 0 ? ` (${useCase.links.length})` : ""}
          </TabsTrigger>
          {isDeploymentPlus && <TabsTrigger value="post-deployment">Post-Deployment</TabsTrigger>}
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Panel title="Organization">
              <ComboField label="Business Area" value={useCase.businessArea} options={BUSINESS_AREAS} onSave={(v)=>save({businessArea:v})} />
              <ComboField label="Strategic Focus" value={useCase.strategicGoal} options={STRATEGIC_FOCUSES} onSave={(v)=>save({strategicGoal:v})} />
              <ComboField label="Workgroup" value={useCase.workgroup} options={WORKGROUPS} onSave={(v)=>save({workgroup:v})} />
              <ComboField label="Grouping" value={useCase.grouping} options={GROUPINGS} onSave={(v)=>save({grouping:v})} />
              <PortfolioPicker useCaseId={useCase.id} />
            </Panel>
            <Panel title="Timeline">
              <div className="space-y-1 py-2 border-b border-slate-50">
                <span className="text-sm text-slate-500">Completed or First Live / Launched</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={useCase.lastCompletedAt ? useCase.lastCompletedAt.slice(0, 10) : ""}
                    onChange={(e) => save({ lastCompletedAt: e.target.value ? e.target.value + "T12:00:00Z" : null })}
                    className="text-sm border border-slate-200 rounded px-2 py-1 text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-accent-indigo/30"
                  />
                  {useCase.lastCompletedAt && (
                    <button onClick={() => save({ lastCompletedAt: null })} className="text-xs text-slate-400 hover:text-status-danger">×</button>
                  )}
                </div>
              </div>
              <div className="space-y-1 py-2 border-b border-slate-50">
                <span className="text-sm text-slate-500">Target Launch Date or Close Date</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={useCase.targetEndDate ? useCase.targetEndDate.slice(0, 10) : ""}
                    onChange={(e) => save({ targetEndDate: e.target.value || null })}
                    className="text-sm border border-slate-200 rounded px-2 py-1 text-slate-800 w-full focus:outline-none focus:ring-1 focus:ring-accent-indigo/30"
                  />
                  {useCase.targetEndDate && (
                    <button onClick={() => save({ targetEndDate: null })} className="text-xs text-slate-400 hover:text-status-danger">×</button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Shown on Calendar at reduced opacity as a tentative target.</p>
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
          {/* ── Danger Zone ── */}
          <details className="group mt-2">
            <summary className="flex items-center gap-2 text-xs text-slate-400 hover:text-status-danger cursor-pointer select-none list-none transition-colors py-1">
              <span className="text-[10px] border border-current rounded px-1 py-0.5 uppercase tracking-wider font-semibold">Danger</span>
              <span>Delete this use case…</span>
            </summary>
            <div className="mt-3 border border-red-200 rounded-xl p-4 bg-red-50/30">
              <p className="text-sm text-slate-600 mb-3">Permanently deletes this use case, all its to-dos, and associated data. <strong>This cannot be undone.</strong></p>
              <Button variant="outline" size="sm"
                className="border-status-danger text-status-danger hover:bg-status-danger hover:text-white transition-colors"
                onClick={handlePermanentDelete}>
                <Trash2 className="size-3.5 mr-1.5" /> Delete permanently
              </Button>
            </div>
          </details>
        </TabsContent>

        {/* TO-DOS */}
        <TabsContent value="todos">
          <Panel title={`To-Dos (${todos.length})`}>
            {!todosLoaded ? <p className="text-sm text-slate-400">Loading…</p>
              : todos.length === 0 ? <p className="text-sm text-slate-400 italic">No to-dos yet.</p>
              : <ul className="space-y-1">{[...todos].sort((a,b)=>{ if(a.dueDate&&b.dueDate) return a.dueDate.localeCompare(b.dueDate); if(a.dueDate&&!b.dueDate) return -1; if(!a.dueDate&&b.dueDate) return 1; return 0; }).map((t)=><TodoRow key={t.id} todo={t} onToggle={()=>handleToggle(t)} onDelete={()=>handleDelete(t.id)} onUpdateText={(v)=>{ setTodos((p)=>p.map((x)=>x.id===t.id?{...x,text:v}:x)); $updateTodo({data:{id:t.id,text:v}}).catch(console.error); }} onUpdateAssignee={(v)=>{ setTodos((p)=>p.map((x)=>x.id===t.id?{...x,assignee:v}:x)); $updateTodo({data:{id:t.id,assignee:v}}).catch(console.error); }} onUpdateDueDate={(v)=>{ setTodos((p)=>p.map((x)=>x.id===t.id?{...x,dueDate:v}:x)); $updateTodo({data:{id:t.id,dueDate:v}}).catch(console.error); }} />)}</ul>
            }
            <div className="border-t border-slate-100 pt-4 mt-4 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Add To-Do</p>
              <Input value={newTodoText} onChange={(e)=>setNewTodoText(e.target.value)} placeholder="What needs to be done?" onKeyDown={(e)=>e.key==="Enter"&&handleAddTodo()} />
              <div className="flex gap-2">
                <Input value={newTodoAssignee} onChange={(e)=>setNewTodoAssignee(e.target.value)} placeholder="Assign to (optional)" className="flex-1" onKeyDown={(e)=>e.key==="Enter"&&handleAddTodo()} />
                <Input type="date" value={newTodoDue} onChange={(e)=>setNewTodoDue(e.target.value)} className="w-36" title="Due date (optional)" />
                <Button onClick={handleAddTodo} disabled={!newTodoText.trim()} className="bg-accent-indigo hover:bg-accent-indigo/90 text-white gap-1.5"><Plus className="size-3.5" /> Add</Button>
              </div>
              <p className="text-[10px] text-slate-400">Adding a to-do auto-sets the flag to "Action Needed"</p>
            </div>
          </Panel>

        </TabsContent>

        {/* METRICS */}
        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Time Saved/Instance */}
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
            <EditableMetricCard label="Annual Time Saved (hrs)" value={annualCalc} onSave={(v)=>save({annualTimeSaved:v||null})} suffix=" hrs" desc="Auto-calculated; edit to override" />
            <EditableMetricCard label="Cost Savings ($)" value={useCase.costSavings} onSave={(v)=>save({costSavings:v||null})} prefix="$" desc="Estimated annual dollar value" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EditableMetricCard label="Dev Lead Time (days)" value={useCase.devLeadTimeDays ?? 0} onSave={(v)=>save({devLeadTimeDays:v||null})} suffix=" days" desc="Days from Development to Completed. Auto-calculated; click to override." />
            <EditableMetricCard label="Issue Resolution Time (days)" value={useCase.resolutionTimeDays ?? 0} onSave={(v)=>save({resolutionTimeDays:v||null})} suffix=" days" desc="Days to resolve a post-deployment issue (Blocked/Action Needed → resolved)." />

          </div>

          {/* Effort (always visible) */}
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
              <p className="text-xs text-slate-500 mb-3">Is this solution primarily proactive (prevents issues before they occur) or reactive (responds to issues)?</p>
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
              <p className="text-xs text-slate-400 mt-2 italic">
                {useCase.proactivePct === 100 ? "Marked Proactive — click again to clear" : useCase.proactivePct === 0 ? "Marked Reactive — click again to clear" : "Not set — click to designate"}
              </p>
            </Panel>
          )}
          {!isDeploymentPlus && <p className="text-xs text-slate-400 italic px-1">Proactive vs Reactive will appear once this use case moves to Deployment stage.</p>}

          {/* Custom metrics table (moved from post-deployment sub-tab) */}
          {isDeploymentPlus && (
            <div className="mt-6">
              <MetricsTab useCaseId={id} metrics={metrics} setMetrics={setMetrics} />
            </div>
          )}
        </TabsContent>

        {/* POST-DEPLOYMENT */}
        {isDeploymentPlus && (
          <TabsContent value="post-deployment" className="space-y-4">
            {!["Deployment","Completed"].includes(useCase.stage) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
                This use case was previously in Deployment or Completed{useCase.lastCompletedAt ? `, most recently completed on ${fmtDate(useCase.lastCompletedAt)}` : ""}. Post-deployment data has been preserved.
              </div>
            )}
            <PostDeploymentSection
              useCaseId={id}
              monitoring={monitoring}
              monDesc={monDesc}
              setMonDesc={setMonDesc}
              reviewCycle={normalizeReviewCycle(useCase.reviewCycle)}
              onReviewCycleChange={(v) => { save({ reviewCycle: v }); $updateReviewCycle({ data: { useCaseId: id, reviewCycle: v } }).catch(console.error); }}
              monOwner={monOwner}
              setMonOwner={setMonOwner}
              monSaving={monSaving}
              saveMonitoring={saveMonitoring}
              metrics={metrics}
              setMetrics={setMetrics}
            />
          </TabsContent>
        )}

        {/* FILES & LINKS */}
        <TabsContent value="notes">
          <Panel title="Notes">
            <NotesEditor
              value={useCase.notes ?? ""}
              onChange={(v) => {
                save({ notes: v });
                $saveNotes({ data: { id: useCase.id, notes: v } }).catch(console.error);
              }}
            />
          </Panel>
        </TabsContent>
        <TabsContent value="files">
          <Panel title="Files & Links">
            <FilesAndLinks links={useCase.links} onUpdate={(links)=>save({links})} />
          </Panel>
        </TabsContent>


      </Tabs>
    </div>
  );
}

function Panel({ title, children }: { title:string; children:React.ReactNode }) {
  return <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm"><h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3><div className="space-y-3">{children}</div></div>;
}
