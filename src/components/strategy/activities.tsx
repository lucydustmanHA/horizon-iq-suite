/**
 * Supporting activities for a goal — inline add, status change, and delete.
 * Used on the goal page and inside the leadership review click-through.
 */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ACTIVITY_STATUSES, fmtDate, type StrategyActivity } from "../../lib/strategy-types";
import { $saveActivity, $deleteActivity } from "../../lib/strategy.server";
import { useRefreshStrategy } from "../../lib/strategy-hooks";

const STATUS_DOT: Record<string, string> = {
  "Not started": "bg-slate-300", "In progress": "bg-sky-500", "Blocked": "bg-red-500", "Done": "bg-emerald-500",
};

export function ActivitiesPanel({ goalId, activities, compact = false }: { goalId: string; activities: StrategyActivity[]; compact?: boolean }) {
  const refresh = useRefreshStrategy();
  const [draft, setDraft] = useState({ activity: "", metric: "", target: "", dueDate: "" });
  const [busy, setBusy] = useState(false);
  const list = activities.filter((a) => a.goalId === goalId);

  const run = async (fn: () => Promise<unknown>, err: string) => {
    try { await fn(); await refresh(); } catch (e) { console.error(e); toast.error(err, { description: String((e as Error)?.message ?? e) }); }
  };
  const add = async () => {
    if (!draft.activity.trim()) return;
    setBusy(true);
    await run(() => $saveActivity({ data: { goalId, activity: draft.activity.trim(), metric: draft.metric, target: draft.target, dueDate: draft.dueDate || null, status: "Not started" } }), "Could not add activity");
    setDraft({ activity: "", metric: "", target: "", dueDate: "" });
    setBusy(false);
  };
  const setStatus = (a: StrategyActivity, status: string) => run(() => $saveActivity({ data: { ...a, status } }), "Could not update activity");
  const remove = (a: StrategyActivity) => run(() => $deleteActivity({ data: { id: a.id } }), "Could not delete activity");

  return (
    <div>
      {list.length === 0 ? (
        <p className="text-xs text-slate-400 px-4 py-3">No supporting activities yet. Add the specific actions that move this goal.</p>
      ) : (
        <table className="w-full text-sm">
          {!compact && (
            <thead className="text-[11px] text-slate-400 uppercase tracking-wide">
              <tr className="border-b border-slate-100">
                <th className="px-4 py-1.5 text-left font-semibold">Activity</th>
                <th className="px-2 py-1.5 text-left font-semibold">Metric / target</th>
                <th className="px-2 py-1.5 text-left font-semibold">Due</th>
                <th className="px-2 py-1.5 text-left font-semibold w-36">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-slate-100">
            {list.map((a) => (
              <tr key={a.id} className="group">
                <td className={`px-4 py-1.5 ${a.status === "Done" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                  {a.activity}
                  {compact && (a.metric || a.dueDate) && <span className="block text-[11px] text-slate-400 no-underline">{[a.metric && `${a.metric}${a.target ? ` → ${a.target}` : ""}`, a.dueDate && `Due ${fmtDate(a.dueDate)}`].filter(Boolean).join(" · ")}</span>}
                </td>
                {!compact && <td className="px-2 py-1.5 text-xs text-slate-600">{a.metric || "—"}{a.target ? <span className="text-slate-400"> → {a.target}</span> : null}</td>}
                {!compact && <td className="px-2 py-1.5 text-xs text-slate-600 whitespace-nowrap">{fmtDate(a.dueDate)}</td>}
                <td className="px-2 py-1.5 w-36">
                  <Select value={a.status} onValueChange={(v) => setStatus(a, v)}>
                    <SelectTrigger className="h-7 text-xs"><span className={`size-1.5 rounded-full mr-1.5 ${STATUS_DOT[a.status] ?? "bg-slate-300"}`} /><SelectValue /></SelectTrigger>
                    <SelectContent>{ACTIVITY_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="pr-2 w-8">
                  <button onClick={() => remove(a)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-status-danger transition" aria-label="Delete activity"><Trash2 className="size-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap gap-2 px-4 py-2.5 border-t border-slate-100 bg-slate-50/50">
        <Input value={draft.activity} onChange={(e) => setDraft({ ...draft, activity: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add an activity…" className="h-8 text-sm flex-1 min-w-[180px] bg-white" />
        {!compact && <Input value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value })} placeholder="Metric" className="h-8 text-sm w-28 bg-white" />}
        {!compact && <Input value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} placeholder="Target" className="h-8 text-sm w-24 bg-white" />}
        <Input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} className="h-8 text-sm w-36 bg-white" />
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={add} disabled={busy || !draft.activity.trim()}><Plus className="size-3" />Add</Button>
      </div>
    </div>
  );
}
