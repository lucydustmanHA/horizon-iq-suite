
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { usePortfolio } from "../lib/store";
import { WORKGROUPS, STAGES, STATUSES, BUSINESS_AREAS, STRATEGIC_FOCUSES, GROUPINGS, VENDORS, SOLUTION_TYPES, TIME_UNITS, type Stage, type Status, type Effort, type TodoItem } from "../lib/types";
import { StageBadge, PriorityBadge, FlagBadge, OwnerAvatar } from "../components/badges";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Input } from "../components/ui/input";
import { ChevronLeft, Pencil, Check, X, Link2, Plus, CheckSquare, Square, Trash2, Paperclip } from "lucide-react";
import { $getTodos, $addTodo, $updateTodo, $deleteTodo } from "../lib/use-cases.server";

export const Route = createFileRoute("/use-cases/$id")({
  component: DetailPage,
  notFoundComponent: () => <div className="p-16 text-center"><h1 className="text-xl font-semibold">Use case not found</h1><Link to="/use-cases" className="text-accent-indigo text-sm mt-2 inline-block">Back to list</Link></div>,
});

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
const fmtRel = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000); if (d < 1) return "today"; if (d === 1) return "yesterday"; if (d < 30) return `${d}d ago`; if (d < 365) return `${Math.floor(d/30)}mo ago`; return `${Math.floor(d/365)}y ago`; };

const ANNUAL_MULTIPLIER: Record<string, number> = { day: 260, week: 52, month: 12, quarter: 4, year: 1 };
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
        onBlur={()=>{ if(draft.trim()){addSettingOption(label.toLowerCase().replace(/ /g,"_"),draft.trim());onSave(draft.trim());} setCustom(false); setDraft(""); }}
        onKeyDown={(e)=>{ if(e.key==="Enter"&&draft.trim()){addSettingOption(label.toLowerCase().replace(/ /g,"_"),draft.trim());onSave(draft.trim());setCustom(false);setDraft("");} if(e.key==="Escape"){setCustom(false);setDraft("");} }} />
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
  return <p className="text-sm text-slate-600 mt-2 max-w-3xl cursor-pointer hover:text-slate-900 transition-colors group flex items-start gap-1" onClick={()=>setEditing(true)}><span>{value||<span className="italic text-slate-400">Click to add description…</span>}</span><Pencil className="size-3 mt-0.5 opacity-0 group-hover:opacity-40 shrink-0" /></p>;
}

// ── Metrics helpers ───────────────────────────────────────────────────────────
function EditableMetricCard({ label, value, onSave, prefix="", suffix="", desc }: { label:string; value:number; onSave:(v:number)=>void; prefix?:string; suffix?:string; desc?:string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(()=>{ setDraft(String(value)); },[value]);
  useEffect(()=>{ if(editing)ref.current?.select(); },[editing]);
  const save = ()=>{ setEditing(false); const n=parseFloat(draft.replace(/[^0-9.]/g,"")); if(!isNaN(n)&&n!==value)onSave(n); };
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

function FilesAndLinks({ links, onUpdate }: { links:string[]; onUpdate:(links:string[])=>void }) {
  const [newLink, setNewLink] = useState("");
  const add = () => { const v=newLink.trim(); if(!v)return; onUpdate([...links, v.startsWith("http")? v:`https://${v}`]); setNewLink(""); };
  const isFile = (l:string) => /\.(pdf|docx?|xlsx?|pptx?|csv|zip|png|jpg)$/i.test(l);
  return (
    <div className="space-y-3">
      {links.map((l,i)=>(
        <div key={i} className="flex items-center gap-2 text-sm">
          {isFile(l) ? <Paperclip className="size-4 text-slate-400 shrink-0" /> : <Link2 className="size-4 text-slate-400 shrink-0" />}
          <a href={l} target="_blank" rel="noreferrer" className="text-accent-indigo hover:underline flex-1 truncate">{l}</a>
          <button onClick={()=>onUpdate(links.filter((_,j)=>j!==i))} className="text-slate-400 hover:text-status-danger"><X className="size-3" /></button>
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <Input value={newLink} onChange={(e)=>setNewLink(e.target.value)} placeholder="https://… or paste a document URL" className="h-8 text-sm flex-1" onKeyDown={(e)=>e.key==="Enter"&&add()} />
        <Button size="sm" variant="outline" onClick={add} className="gap-1 h-8 px-3"><Plus className="size-3" /> Add</Button>
      </div>
      <p className="text-[10px] text-slate-400">Supports any URL — web links, SharePoint, Google Docs, etc.</p>
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

// ── Main component ────────────────────────────────────────────────────────────
function DetailPage() {
  const { id } = Route.useParams();
  const useCase = usePortfolio((s) => s.useCases.find((u) => u.id === id));
  const updateUseCase = usePortfolio((s) => s.updateUseCase);
  const addComment = usePortfolio((s) => s.addComment);
  const [comment, setComment] = useState("");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todosLoaded, setTodosLoaded] = useState(false);
  const [newTodoText, setNewTodoText] = useState("");
  const [newTodoAssignee, setNewTodoAssignee] = useState("");

  useEffect(() => {
    $getTodos({ data: { useCaseId: id } }).then((t) => { setTodos(t); setTodosLoaded(true); });
  }, [id]);

  if (!useCase) throw notFound();
  const save = (patch: Parameters<typeof updateUseCase>[1]) => updateUseCase(useCase.id, patch);

  const isDeploymentPlus = ["Deployment","Completed"].includes(useCase.stage);
  const priorityLabel = useCase.priority === 1 ? "2026" : useCase.priority === 2 ? "2027+" : "—";
  const annualCalc = calcAnnual(useCase.timeSavedValue ?? 0, useCase.timeSavedUnit ?? "month");

  const handleAddTodo = async () => {
    const text = newTodoText.trim();
    if (!text) return;
    const t = await $addTodo({ data: { useCaseId: id, text, assignee: newTodoAssignee.trim() } });
    setTodos((prev) => [...prev, t]);
    // auto-flag in store
    if (!useCase.status || (useCase.status !== "Blocked" && useCase.status !== "Action Needed")) {
      save({ status: "Action Needed" });
    }
    setNewTodoText(""); setNewTodoAssignee("");
  };
  const handleToggle = async (t: TodoItem) => {
    setTodos((prev) => prev.map((x) => x.id === t.id ? { ...x, done: !x.done } : x));
    await $updateTodo({ data: { id: t.id, done: !t.done } });
  };
  const handleDelete = async (todoId: string) => {
    setTodos((prev) => prev.filter((x) => x.id !== todoId));
    await $deleteTodo({ data: { id: todoId } });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <Link to="/use-cases" className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"><ChevronLeft className="size-4" /> All use cases</Link>

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
          </div>
        </div>
        {/* Header facets — all editable */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          {[
            { lbl:"Stage", render: () => <Select value={useCase.stage} onValueChange={(v)=>save({stage:v as Stage})}><SelectTrigger className="h-auto border-0 shadow-none p-0 font-medium text-slate-900 hover:text-accent-indigo focus:ring-0 w-auto text-sm"><SelectValue /></SelectTrigger><SelectContent>{STAGES.map((s)=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select> },
            { lbl:"Workgroup", render: () => <Select value={useCase.workgroup} onValueChange={(v)=>save({workgroup:v})}><SelectTrigger className="h-auto border-0 shadow-none p-0 font-medium text-slate-900 hover:text-accent-indigo focus:ring-0 w-auto text-sm"><SelectValue /></SelectTrigger><SelectContent>{WORKGROUPS.map((wg)=><SelectItem key={wg} value={wg}>{wg}</SelectItem>)}</SelectContent></Select> },
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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="todos">To-Dos ({todos.length})</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="files">Files & Links ({useCase.links.length})</TabsTrigger>
          <TabsTrigger value="comments">Comments ({useCase.comments.length})</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
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

        {/* TO-DOS */}
        <TabsContent value="todos">
          <Panel title={`To-Dos (${todos.length})`}>
            {!todosLoaded ? <p className="text-sm text-slate-400">Loading…</p>
              : todos.length === 0 ? <p className="text-sm text-slate-400 italic">No to-dos yet.</p>
              : <ul className="space-y-1">{todos.map((t)=><TodoRow key={t.id} todo={t} onToggle={()=>handleToggle(t)} onDelete={()=>handleDelete(t.id)} onUpdateText={(v)=>{ setTodos((p)=>p.map((x)=>x.id===t.id?{...x,text:v}:x)); $updateTodo({data:{id:t.id,text:v}}).catch(console.error); }} onUpdateAssignee={(v)=>{ setTodos((p)=>p.map((x)=>x.id===t.id?{...x,assignee:v}:x)); $updateTodo({data:{id:t.id,assignee:v}}).catch(console.error); }} />)}</ul>
            }
            <div className="border-t border-slate-100 pt-4 mt-4 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Add To-Do</p>
              <Input value={newTodoText} onChange={(e)=>setNewTodoText(e.target.value)} placeholder="What needs to be done?" onKeyDown={(e)=>e.key==="Enter"&&handleAddTodo()} />
              <div className="flex gap-2">
                <Input value={newTodoAssignee} onChange={(e)=>setNewTodoAssignee(e.target.value)} placeholder="Assign to (optional)" className="flex-1" onKeyDown={(e)=>e.key==="Enter"&&handleAddTodo()} />
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
                  <SelectContent>{TIME_UNITS.map((u)=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Hours saved each time this solution runs</p>
            </div>
            <EditableMetricCard label="Annual Time Saved (hrs)" value={annualCalc} onSave={(v)=>save({annualTimeSaved:v})} suffix=" hrs" desc="Auto-calculated; edit to override" />
            <EditableMetricCard label="Cost Savings ($)" value={useCase.costSavings} onSave={(v)=>save({costSavings:v})} prefix="$" desc="Estimated annual dollar value" />
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
                  <p className="text-xs font-medium text-slate-500 mb-2">Effort After <span className="font-normal text-slate-400">(available once in Deployment)</span></p>
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

          {/* Proactive (only in Deployment+) */}
          {isDeploymentPlus && (
            <Panel title="Proactive vs Reactive">
              <p className="text-xs text-slate-500 mb-3">Is this solution primarily proactive (prevents issues before they occur) or reactive (responds to issues)?</p>
              <div className="flex gap-3">
                <button onClick={()=>save({proactivePct:100,reactivePct:0})}
                  className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors border-2 ${useCase.proactivePct>50?"bg-status-success text-white border-status-success":"border-slate-200 text-slate-500 hover:border-status-success/40"}`}>
                  Proactive
                </button>
                <button onClick={()=>save({proactivePct:0,reactivePct:100})}
                  className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-colors border-2 ${useCase.reactivePct>50?"bg-status-warning text-white border-status-warning":"border-slate-200 text-slate-500 hover:border-status-warning/40"}`}>
                  Reactive
                </button>
              </div>
              {(useCase.proactivePct > 0 || useCase.reactivePct > 0) && (
                <p className="text-xs text-slate-400 mt-2">Currently: {useCase.proactivePct >= 50 ? "Proactive" : "Reactive"}</p>
              )}
              {!useCase.proactivePct && !useCase.reactivePct && <p className="text-xs text-slate-400 mt-2 italic">Not set</p>}
            </Panel>
          )}
          {!isDeploymentPlus && <p className="text-xs text-slate-400 italic px-1">Proactive vs Reactive will appear once this use case moves to Deployment stage.</p>}
        </TabsContent>

        {/* ACTIVITY */}
        <TabsContent value="activity">
          <Panel title="Activity Timeline">
            <ol className="relative border-l border-slate-200 ml-2 space-y-6 pt-2">
              {[...useCase.activity].reverse().map((a)=>(
                <li key={a.id} className="pl-6 relative"><span className="absolute -left-[7px] top-1 size-3 rounded-full bg-white border-2 border-accent-indigo" /><p className="text-xs text-slate-400 font-medium">{fmtDate(a.date)} · {fmtRel(a.date)}</p><p className="text-sm text-slate-900 mt-0.5">{a.message}</p>{a.actor&&<p className="text-[11px] text-slate-500">by {a.actor}</p>}</li>
              ))}
            </ol>
          </Panel>
        </TabsContent>

        {/* FILES & LINKS */}
        <TabsContent value="files">
          <Panel title="Files & Links">
            <FilesAndLinks links={useCase.links} onUpdate={(links)=>save({links})} />
          </Panel>
        </TabsContent>

        {/* COMMENTS */}
        <TabsContent value="comments">
          <Panel title="Discussion">
            <div className="space-y-4">
              {useCase.comments.map((c)=>(
                <div key={c.id} className="flex gap-3"><OwnerAvatar name={c.author} size={28} /><div className="flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium text-slate-900">{c.author}</span><span className="text-xs text-slate-400">{fmtRel(c.date)}</span></div><p className="text-sm text-slate-700 mt-1">{c.body}</p></div></div>
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

function Panel({ title, children }: { title:string; children:React.ReactNode }) {
  return <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm"><h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3><div className="space-y-3">{children}</div></div>;
}
