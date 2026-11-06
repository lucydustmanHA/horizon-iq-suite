/**
 * Shared building blocks for the Strategy side. Uses the same Tailwind tokens and shadcn
 * components as AI & Automation so both halves look like one product.
 */
import { useEffect, useState, type ReactNode } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  MONTHS, GOAL_STATUSES, STATUS_STYLES, RAG_STYLES, priorityColor, valueStatus, monthStatus, canOverrideMonths, shortCellLabel, parseNumeric, guessDirection, emptyGoal,
  type GoalStatus, type Rag, type MonthRag, type StrategyGoal,
} from "../../lib/strategy-types";
import { $saveGoal } from "../../lib/strategy.server";
import { useStrategyOptions, useRefreshStrategy, useStrategyUI } from "../../lib/strategy-hooks";

export function StatusPill({ status, className = "" }: { status: GoalStatus; className?: string }) {
  const st = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap ${st.pill} ${className}`}>
      <span className={`size-1.5 rounded-full ${st.dot}`} />{status}
    </span>
  );
}

export function RagPill({ rag }: { rag: Rag | null }) {
  if (!rag) return <span className="text-[11px] text-slate-400">Not reviewed</span>;
  const st = RAG_STYLES[rag];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${st.pill}`}>
      <span className={`size-1.5 rounded-full ${st.dot}`} />{st.label}
    </span>
  );
}

export function PriorityTag({ name, all }: { name: string; all?: string[] }) {
  if (!name) return <span className="text-xs text-slate-400">—</span>;
  const c = priorityColor(name, all);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
      <span className="size-2 rounded-sm" style={{ backgroundColor: c }} />{name}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

export function KpiTile({ label, value, sub, accent, active, onClick }: {
  label: string; value: ReactNode; sub?: ReactNode; accent?: string; active?: boolean; onClick?: () => void;
}) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp onClick={onClick}
      className={`text-left bg-white rounded-xl border p-4 shadow-sm transition-all ${accent ?? ""} ${active ? "border-accent-indigo ring-2 ring-accent-indigo/20" : "border-slate-200"} ${onClick ? "hover:border-slate-300 cursor-pointer" : ""}`}>
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1.5">{sub}</p>}
    </Comp>
  );
}

export function Card({ title, actions, children, className = "", bodyClassName = "p-4" }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      {icon && <div className="size-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">{icon}</div>}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {body && <p className="text-xs text-slate-500 mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** 12 compact month cells coloured by status. Read-only unless onEdit is supplied. */
export type MonthMeta = { rag?: MonthRag | null; comment?: string };

/** 12 compact month cells coloured by status. Read-only unless onEdit is supplied.
 *  onMeta adds a per-month "⋯" button for comments and (2026 only) manual red/green. */
export function MonthStrip({ goal, onEdit, onMeta, highlightMonth, size = "sm" }: {
  goal: StrategyGoal; onEdit?: (monthIdx: number, value: string) => void; onMeta?: (monthIdx: number, meta: MonthMeta) => void;
  highlightMonth?: number; size?: "sm" | "md";
}) {
  const h = size === "md" ? "h-12" : "h-7";
  const [metaIdx, setMetaIdx] = useState<number | null>(null);
  return (
    <>
    <div className={`grid gap-1 ${size === "sm" ? "grid-cols-[repeat(12,minmax(2.75rem,1fr))]" : "grid-cols-12"}`}>
      {MONTHS.map((m, i) => {
        const v = goal.progress[i] ?? "";
        const st = STATUS_STYLES[monthStatus(goal, i)];
        const ring = highlightMonth === i ? "ring-2 ring-accent-indigo/60" : "";
        const comment = goal.monthComments?.[i] ?? "";
        const manual = canOverrideMonths(goal.year) && !!goal.monthRag?.[i];
        const tip = `${m}: ${v || "not reported"}${manual ? " (colour set manually)" : ""}${comment ? `\n${comment}` : ""}`;
        return (
          <div key={m} className="min-w-0 relative" title={tip}>
            {size === "md" && <p className="text-[10px] text-center text-slate-400 mb-0.5">{m}</p>}
            {onEdit ? (
              <MonthInput value={v} onCommit={(nv) => onEdit(i, nv)} className={`${h} ${st.cell} ${ring}`} />
            ) : (
              <div className={`${h} ${st.cell} ${ring} rounded-md flex items-center justify-center text-[10px] font-medium truncate px-0.5`}>
                {size === "md" ? (v || "—") : shortCellLabel(v)}
              </div>
            )}
            {(comment || manual) && (
              <span className="pointer-events-none absolute right-0.5 bottom-0.5 flex gap-0.5">
                {manual && <span className="size-1.5 rounded-full bg-slate-700/60" />}
                {comment && <span className="size-1.5 rounded-full bg-accent-indigo" />}
              </span>
            )}
            {onMeta && (
              <button type="button" onClick={() => setMetaIdx(i)}
                className="mt-0.5 w-full text-[10px] leading-3 text-slate-400 hover:text-slate-700" aria-label={`Comment or colour for ${m}`}>
                {comment ? "💬" : "⋯"}
              </button>
            )}
          </div>
        );
      })}
    </div>
    {onMeta && metaIdx !== null && (
      <MonthMetaDialog goal={goal} monthIdx={metaIdx} onClose={() => setMetaIdx(null)}
        onSave={(meta) => { onMeta(metaIdx, meta); setMetaIdx(null); }} />
    )}
    </>
  );
}

function MonthMetaDialog({ goal, monthIdx, onClose, onSave }: {
  goal: StrategyGoal; monthIdx: number; onClose: () => void; onSave: (meta: MonthMeta) => void;
}) {
  const allowRag = canOverrideMonths(goal.year);
  const [rag, setRag] = useState<MonthRag | null>(goal.monthRag?.[monthIdx] ?? null);
  const [comment, setComment] = useState(goal.monthComments?.[monthIdx] ?? "");
  const auto = valueStatus(goal, goal.progress[monthIdx] ?? "");
  const opt = (val: MonthRag | null, text: string, cls: string) => (
    <button type="button" onClick={() => setRag(val)}
      className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${rag === val ? `${cls} ring-2 ring-offset-1 ring-accent-indigo/50` : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {text}
    </button>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{MONTHS[monthIdx]} {goal.year} · {goal.progress[monthIdx] || "no number yet"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {allowRag && (
            <div>
              {label("Colour")}
              <div className="flex gap-2">
                {opt(null, `Auto (${auto})`, "border-slate-300 bg-slate-50 text-slate-700")}
                {opt("green", "Green", "border-emerald-300 bg-emerald-50 text-emerald-700")}
                {opt("red", "Red", "border-red-300 bg-red-50 text-red-700")}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Overrides the target comparison for this month only.</p>
            </div>
          )}
          <div>
            {label("Comment")}
            <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Why this number? Context, caveats, actions…" className="text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(allowRag ? { rag, comment } : { comment })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MonthInput({ value, onCommit, className }: { value: string; onCommit: (v: string) => void; className: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft.trim() !== value.trim()) onCommit(draft.trim()); };
  return (
    <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(value); (e.target as HTMLInputElement).blur(); } }}
      placeholder="—"
      className={`w-full rounded-md text-center text-xs font-medium border border-transparent focus:border-accent-indigo focus:outline-none placeholder:text-slate-300 ${className}`} />
  );
}

export function TrendChart({ goal, height = 160 }: { goal: StrategyGoal; height?: number }) {
  const data = MONTHS.map((m, i) => ({ month: m, value: parseNumeric(goal.progress[i] ?? "") }));
  const target = parseNumeric(goal.targetValue);
  const hasData = data.some((d) => d.value !== null);
  if (!hasData) return <div className="flex items-center justify-center text-xs text-slate-400" style={{ height }}>No numeric values reported yet</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any) => [v, goal.monthlyMetric || "Actual"]} />
        {target !== null && <ReferenceLine y={target} stroke="#ed7438" strokeDasharray="4 4" label={{ value: `Target ${goal.targetValue}`, fontSize: 10, fill: "#ed7438", position: "insideTopRight" }} />}
        <Line type="monotone" dataKey="value" stroke="#419dab" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const label = (t: string) => <label className="text-xs font-medium text-slate-500 mb-1 block">{t}</label>;

function OptionSelect({ value, options, onChange, placeholder = "Select…" }: { value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );
}

/** Create / edit a goal. Pass `goal` to edit; omit to create (optionally with defaults). */
export function GoalDialog({ open, onClose, goal, defaults, onSaved }: {
  open: boolean; onClose: () => void; goal?: StrategyGoal | null; defaults?: Partial<StrategyGoal>; onSaved?: (id: string) => void;
}) {
  const year = useStrategyUI((s) => s.year);
  const { departments, priorities } = useStrategyOptions();
  const refresh = useRefreshStrategy();
  const [f, setF] = useState<StrategyGoal>(() => ({ ...emptyGoal(year), ...defaults, ...(goal ?? {}) }));
  const [dirTouched, setDirTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setF({ ...emptyGoal(year), ...defaults, ...(goal ?? {}) }); setDirTouched(!!goal); } }, [open, goal?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof StrategyGoal>(k: K, v: StrategyGoal[K]) => setF((p) => {
    const next = { ...p, [k]: v };
    if (!dirTouched && (k === "objective" || k === "description")) next.direction = guessDirection(`${next.objective} ${next.description}`);
    return next;
  });
  const valid = f.objective.trim() && f.department && f.priority;
  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const { progress: _p, updatedAt: _u, ...rest } = f;
      const { id } = await $saveGoal({ data: { ...rest, id: goal?.id } });
      await refresh();
      toast.success(goal ? "Goal updated" : "Goal created");
      onSaved?.(id);
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Could not save goal", { description: String((e as Error)?.message ?? e) });
    } finally { setSaving(false); }
  };
  const row = "grid grid-cols-2 gap-3";
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-3 gap-3">
            <div>{label("Department *")}<OptionSelect value={f.department} options={departments} onChange={(v) => set("department", v)} /></div>
            <div>{label("Priority *")}<OptionSelect value={f.priority} options={priorities} onChange={(v) => set("priority", v)} /></div>
            <div>{label("Year")}<Input type="number" value={f.year} onChange={(e) => set("year", Number(e.target.value) || year)} className="h-9" /></div>
          </div>
          <div>{label("Objective *")}<Input value={f.objective} onChange={(e) => set("objective", e.target.value)} placeholder="e.g. Reduce controllable delays" autoFocus /></div>
          <div>{label("Goal statement")}<Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="By end of year, …" /></div>
          <div className={row}>
            <div>{label("Success criteria")}<Input value={f.successCriteria} onChange={(e) => set("successCriteria", e.target.value)} /></div>
            <div>{label("Monthly metric")}<Input value={f.monthlyMetric} onChange={(e) => set("monthlyMetric", e.target.value)} placeholder="What gets reported each month" /></div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div>{label("Baseline")}<Input value={f.baselineValue} onChange={(e) => set("baselineValue", e.target.value)} /></div>
            <div>{label("Target")}<Input value={f.targetValue} onChange={(e) => set("targetValue", e.target.value)} /></div>
            <div>{label("Unit")}<Input value={f.unitOfMeasure} onChange={(e) => set("unitOfMeasure", e.target.value)} placeholder="%, count…" /></div>
            <div>{label("Good when")}
              <Select value={f.direction} onValueChange={(v) => { setDirTouched(true); set("direction", v as any); }}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="increase">At or above target</SelectItem><SelectItem value="decrease">At or below target</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>{label("Owner")}<Input value={f.owner} onChange={(e) => set("owner", e.target.value)} /></div>
            <div>{label("Secondary owner")}<Input value={f.secondaryOwner} onChange={(e) => set("secondaryOwner", e.target.value)} /></div>
            <div>{label("Status")}
              <Select value={f.statusOverride ?? "__auto__"} onValueChange={(v) => set("statusOverride", v === "__auto__" ? null : (v as GoalStatus))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (from monthly actuals)</SelectItem>
                  {GOAL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="bg-accent-indigo hover:bg-accent-indigo/90 text-white" onClick={save} disabled={saving || !valid}>{saving ? "Saving…" : goal ? "Save changes" : "Create goal"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function priorityStyle(name: string, all?: string[]) {
  return { backgroundColor: priorityColor(name, all) };
}

export function LoadError({ error }: { error: unknown }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p className="font-semibold">Strategy data didn't load</p>
      <p className="text-xs mt-1 text-red-600">{String((error as Error)?.message ?? error)}</p>
    </div>
  );
}
